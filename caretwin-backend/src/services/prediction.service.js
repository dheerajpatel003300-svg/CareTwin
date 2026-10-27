// Calls the internal Python ML service. Nothing is stored: inputs and the score live only
// for the duration of the request.
const DEFAULT_TIMEOUT_MS = 60000;
const MIN_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 120000;
const WARM_UP_INTERVAL_MS = 4 * 60 * 1000;
const WARM_UP_TIMEOUT_MS = 65000;

const configuredTimeout = Number(process.env.ML_SERVICE_TIMEOUT_MS);
const TIMEOUT_MS = Math.min(
  MAX_TIMEOUT_MS,
  Math.max(
    MIN_TIMEOUT_MS,
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_TIMEOUT_MS,
  ),
);
let lastWarmUpAt = null;

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

function warmUpMlService() {
  try {
    const configuredUrl = process.env.ML_SERVICE_URL;
    if (!configuredUrl) return;

    const now = Date.now();
    if (lastWarmUpAt !== null && now - lastWarmUpAt < WARM_UP_INTERVAL_MS) return;
    lastWarmUpAt = now;

    const url = configuredUrl.replace(/\/+$/, "");
    Promise.resolve(
      fetch(`${url}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(WARM_UP_TIMEOUT_MS),
      }),
    ).catch(() => {});
  } catch {
    // A best-effort warm-up must never affect the dashboard response.
  }
}

module.exports = { getSchema, predictMortality, warmUpMlService };
