import os, warnings
os.environ["ML_ALLOW_INSECURE"] = "true"
warnings.filterwarnings("ignore")
from fastapi.testclient import TestClient
import app as svc

BASE = dict(age=70, gender="M", admission_type="EW EMER.", admission_location="EMERGENCY ROOM",
            insurance="Medicare", language="English", marital_status="MARRIED", race="WHITE",
            admission_time="2026-03-14T02:30:00")
HEALTHY = {"Hemoglobin": [14.0], "Creatinine": [0.8], "Potassium": [4.0], "Urea Nitrogen": [14],
           "Sodium": [140], "Glucose": [95], "Calcium, Total": [9.4]}
SICK = {"Hemoglobin": [7.1, 6.8], "Creatinine": [3.2, 4.1], "Potassium": [5.9, 6.3], "Urea Nitrogen": [78, 92],
        "Sodium": [128, 126], "Glucose": [310, 280], "Calcium, Total": [7.1]}

with TestClient(svc.app) as c:
    assert c.get("/health").json()["features"] == 158
    r = c.post("/predict", json={**BASE, "labs": HEALTHY}); assert r.status_code == 200, r.text
    p_ok = r.json()["probability"]
    p_bad = c.post("/predict", json={**BASE, "age": 85, "labs": SICK}).json()["probability"]
    p_none = c.post("/predict", json={**BASE}).json()
    print(f"healthy={p_ok}  sick={p_bad}  no-labs={p_none['probability']}  warnings={p_none['warnings']}")
    assert 0 <= p_ok <= 1 and 0 <= p_bad <= 1
    date_only = c.post("/predict", json={
        "age": 70,
        "gender": "M",
        "admission_date": "2026-03-14",
        "labs": HEALTHY,
    })
    assert date_only.status_code == 200, date_only.text
    assert 0 <= date_only.json()["probability"] <= 1
    assert c.post("/predict", json={"age": 70, "labs": HEALTHY}).status_code == 422
    # unit mix-up is rejected
    r = c.post("/predict", json={**BASE, "labs": {"Glucose": [-5]}}); assert r.status_code == 422
    r = c.post("/predict", json={**BASE, "labs": {"Foo": [1]}}); assert r.status_code == 422
    # unseen category does not crash
    r = c.post("/predict", json={**BASE, "language": "Klingon"}); assert r.status_code == 200
    # missing optional fields do not crash
    r = c.post("/predict", json={"age": 40, "admission_time": "2026-01-01T10:00:00"}); assert r.status_code == 200
    # vector layout: set fields land in the right columns
    req = svc.PredictRequest(**BASE, labs=SICK)
    v = svc.build_vector(req); ix = svc.state["index"]
    assert v[ix["age"]] == 70 and v[ix["insurance_Medicare"]] == 1 and v[ix["admission_hour_2"]] == 1
    assert v[ix["Creatinine__last"]] == 4.1 and v[ix["Creatinine__count"]] == 2
    assert v[ix["admission_weekday_5"]] == 1  # 2026-03-14 is a Saturday -> 5
    print("all checks passed")
