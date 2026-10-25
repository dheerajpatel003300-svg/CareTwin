"""CareTwin mortality-risk service (internal only).

Loads the XGBoost model + preprocessing bundle once at startup and exposes:
  GET  /health
  GET  /schema    - field list, units and allowed category values (for the form)
  POST /predict   - returns risk probability for in-hospital death
                    within the model's prediction window.

Run behind the Express backend, never expose it to the internet directly.
"""
import datetime as dt
import hmac
import logging
import math
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

log = logging.getLogger("mortality-service")
ASSETS = Path(os.environ.get("ASSETS_DIR", Path(__file__).parent / "assets"))
MODEL_PATH = ASSETS / "xgboost_mortality_model.json"
PREP_PATH = ASSETS / "preprocessing.joblib"
MISSING = "__MISSING__"

# Plausible ranges in the conventional US units the training data (MIMIC-style) uses.
# Rejecting out-of-range values catches unit mix-ups (e.g. mmol/L instead of mg/dL).
LAB_UNITS = {
    "Hemoglobin": ("g/dL", 0.0, 25.0),
    "Creatinine": ("mg/dL", 0.0, 30.0),
    "Potassium": ("mEq/L", 0.5, 12.0),
    "Urea Nitrogen": ("mg/dL", 0.0, 300.0),
    "Sodium": ("mEq/L", 80.0, 200.0),
    "Glucose": ("mg/dL", 0.0, 2000.0),
    "Calcium, Total": ("mg/dL", 0.0, 25.0),
}

DISCLAIMER = (
    "This score comes from a statistical model trained on hospital "
    "admission data and is not a diagnosis or medical advice. It must not be used to make "
    "care decisions without review by a qualified clinician."
)

state: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not os.environ.get("ML_API_KEY") and os.environ.get("ML_ALLOW_INSECURE") != "true":
        raise RuntimeError("ML_API_KEY is not set (set ML_ALLOW_INSECURE=true for local dev only)")
    prep = joblib.load(PREP_PATH)
    booster = xgb.Booster()
    booster.load_model(str(MODEL_PATH))
    feature_names: List[str] = prep["feature_names"]
    if booster.num_features() != len(feature_names):
        raise RuntimeError(
            f"model expects {booster.num_features()} features, preprocessing defines {len(feature_names)}"
        )
    encoder = prep["categorical_encoder"]
    encoded_names = list(encoder.get_feature_names_out())
    unknown = [n for n in encoded_names if n not in feature_names]
    if unknown:
        raise RuntimeError(f"encoder produces columns not in feature_names: {unknown[:5]}")
    state.update(
        prep=prep,
        booster=booster,
        feature_names=feature_names,
        index={n: i for i, n in enumerate(feature_names)},
        encoded_names=encoded_names,
        categories={
            c: [str(v) for v in cats]
            for c, cats in zip(prep["categorical_columns"], encoder.categories_)
        },
    )
    log.info("model loaded: %d features, threshold %.4f", len(feature_names), prep["decision_threshold"])
    yield
    state.clear()


app = FastAPI(
    title="CareTwin mortality service",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def require_key(x_api_key: Optional[str] = Header(default=None)):
    expected = os.environ.get("ML_API_KEY")
    if not expected:  # only reachable with ML_ALLOW_INSECURE=true
        return
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


class PredictRequest(BaseModel):
    age: float = Field(ge=0, le=120)
    gender: Optional[str] = None
    admission_type: Optional[str] = None
    admission_location: Optional[str] = None
    insurance: Optional[str] = None
    language: Optional[str] = None
    marital_status: Optional[str] = None
    race: Optional[str] = None
    admission_date: Optional[dt.date] = Field(default=None, description="ISO 8601 admission date")
    admission_time: Optional[dt.datetime] = Field(default=None, description="Optional ISO 8601 admission date/time")
    # Chronological measurements from the observation window, per lab. Omit a lab if not measured.
    labs: Dict[str, List[float]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_admission_date(self):
        if self.admission_time is None and self.admission_date is None:
            raise ValueError("admission_date is required when admission_time is not supplied")
        return self

    @field_validator("labs")
    @classmethod
    def check_labs(cls, labs):
        for name, values in labs.items():
            if name not in LAB_UNITS:
                raise ValueError(f"unknown lab '{name}'")
            unit, lo, hi = LAB_UNITS[name]
            if len(values) > 200:
                raise ValueError(f"too many values for {name}")
            for v in values:
                if not math.isfinite(v) or v < lo or v > hi:
                    raise ValueError(f"{name} value {v} outside plausible range {lo}-{hi} {unit}")
        return labs


def build_vector(req: PredictRequest) -> np.ndarray:
    prep = state["prep"]
    index = state["index"]
    vec = np.zeros(len(state["feature_names"]), dtype=np.float32)

    # Labs: mean / last / count. Not measured -> NaN (XGBoost handles missing), count 0.
    for lab in prep["lab_names"]:
        values = req.labs.get(lab) or []
        stats = {
            "mean": float(np.mean(values)) if values else np.nan,
            "last": float(values[-1]) if values else np.nan,
            "count": float(len(values)),
        }
        for stat in prep["lab_statistics"]:
            vec[index[f"{lab}__{stat}"]] = stats[stat]

    vec[index["age"]] = req.age

    admission_date = req.admission_time.date() if req.admission_time else req.admission_date
    if admission_date is None:
        raise ValueError("admission_date is required")
    raw = {
        "admission_type": req.admission_type,
        "admission_location": req.admission_location,
        "insurance": req.insurance,
        "language": req.language,
        "marital_status": req.marital_status,
        "race": req.race,
        "gender": req.gender,
        "admission_hour": str(req.admission_time.hour) if req.admission_time else None,
        "admission_month": str(admission_date.month),
        "admission_weekday": str(admission_date.weekday()),  # Monday = 0 (pandas convention)
    }
    row = {}
    for col in prep["categorical_columns"]:
        val = raw[col]
        val = MISSING if val is None or str(val).strip() == "" else str(val)
        if val == MISSING and MISSING not in state["categories"][col]:
            val = None  # no missing bucket for this column -> encoder emits all zeros
        row[col] = val
    frame = pd.DataFrame([row], columns=prep["categorical_columns"], dtype=object)
    encoded = prep["categorical_encoder"].transform(frame)
    dense = encoded.toarray()[0] if hasattr(encoded, "toarray") else np.asarray(encoded)[0]
    for name, value in zip(state["encoded_names"], dense):
        vec[index[name]] = value
    return vec


@app.get("/health")
def health():
    return {"status": "ok", "features": len(state.get("feature_names", []))}


@app.get("/schema", dependencies=[Depends(require_key)])
def schema():
    prep = state["prep"]
    return {
        "predictionWindowHours": prep["prediction_window_hours"],
        "labs": {k: {"unit": v[0], "min": v[1], "max": v[2]} for k, v in LAB_UNITS.items()},
        "categories": state["categories"],
    }


@app.post("/predict", dependencies=[Depends(require_key)])
def predict(req: PredictRequest):
    warnings = []
    if req.age < 18:
        warnings.append("Age is below 18; the model was most likely trained on adult admissions.")
    if not req.labs:
        warnings.append("No lab values supplied; the score relies on demographics and admission details only.")
    elif len(req.labs) < len(state["prep"]["lab_names"]):
        warnings.append("Some labs were not supplied and were treated as not measured.")

    vec = build_vector(req)
    dmat = xgb.DMatrix(vec.reshape(1, -1), feature_names=None)
    prob = float(state["booster"].predict(dmat)[0])
    threshold = float(state["prep"]["decision_threshold"])
    flagged = prob >= threshold
    return {
        "probability": round(prob, 4),
        "threshold": round(threshold, 4),
        "flagged": flagged,
        "riskLevel": "elevated" if flagged else "lower",
        "predictionWindowHours": state["prep"]["prediction_window_hours"],
        "target": state["prep"]["target"],
        "warnings": warnings,
        "disclaimer": DISCLAIMER,
    }
