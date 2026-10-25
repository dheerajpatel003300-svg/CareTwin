// Calls the internal Python ML service. Nothing is stored: inputs and the score live only
// for the duration of the request.
const TIMEOUT_MS = 10000;

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function config() {
  const url = process.env.ML_SERVICE_URL;
  if (!url) throw httpError(503, "The risk prediction service is not configured.");
  return { url: url.replace(/\/+$/, ""), key: process.env.ML_SERVICE_API_KEY || "" };
}

async function callMl(path, { method = "GET", body } = {}) {
  const { url, key } = config();
  let response;
  try {
    response = await fetch(`${url}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(key && { "X-API-Key": key }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("ml-service request failed:", err.message);
    throw httpError(503, "The risk prediction service is not available right now.");
  }

  if (response.status === 422) {
    const payload = await response.json().catch(() => ({}));
    const details = (payload.detail || []).map((d) => ({
      field: (d.loc || []).filter((p) => p !== "body").join("."),
      message: d.msg,
    }));
    throw httpError(400, "Validation failed", details);
  }
  if (!response.ok) {
    console.error("ml-service returned", response.status);
    throw httpError(502, "The risk prediction service returned an error.");
  }
  return response.json();
}

async function getSchema() {
  return callMl("/schema");
}

async function predictMortality(input) {
  return callMl("/predict", {
    method: "POST",
    body: {
      age: input.age,
      gender: input.gender,
      admission_date: input.admissionDate,
      admission_time: input.admissionTime,
      admission_type: input.admissionType,
      admission_location: input.admissionLocation,
      insurance: input.insurance,
      language: input.language,
      marital_status: input.maritalStatus,
      race: input.race,
      labs: input.labs,
    },
  });
}

module.exports = { getSchema, predictMortality };
