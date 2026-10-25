const assert = require("node:assert/strict");
const test = require("node:test");
const { loadEnv } = require("../src/config/env");

const BASE_ENV = {
  NODE_ENV: "production",
  CORS_ORIGINS: "https://frontend.example",
  FRONTEND_URL: "https://frontend.example",
  DATABASE_URL: "postgresql://caretwin:password@db.example:5432/caretwin",
  REDIS_URL: "redis://redis.example:6379",
  JWT_ACCESS_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
};

function withEnvironment(overrides, callback) {
  const names = new Set([...Object.keys(BASE_ENV), ...Object.keys(overrides)]);
  const previous = new Map([...names].map((name) => [name, process.env[name]]));

  for (const name of names) delete process.env[name];
  Object.assign(process.env, BASE_ENV, overrides);

  try {
    return callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function assertProductionError(overrides, message) {
  withEnvironment(overrides, () => {
    assert.throws(() => loadEnv(), new RegExp(message));
  });
}

test("production rejects JWT secrets shorter than 32 characters", () => {
  assertProductionError(
    { JWT_ACCESS_SECRET: "a".repeat(31) },
    "JWT_ACCESS_SECRET must be at least 32 characters",
  );
  assertProductionError(
    { JWT_REFRESH_SECRET: "b".repeat(31) },
    "JWT_REFRESH_SECRET must be at least 32 characters",
  );
});

test("production rejects placeholder JWT secrets case-insensitively", () => {
  assertProductionError(
    { JWT_ACCESS_SECRET: `prefix-CHANGE-ME-${"a".repeat(32)}` },
    "JWT_ACCESS_SECRET must not contain a placeholder",
  );
  assertProductionError(
    { JWT_REFRESH_SECRET: `prefix-ChAnGeMe-${"b".repeat(32)}` },
    "JWT_REFRESH_SECRET must not contain a placeholder",
  );
});

test("production rejects identical JWT secrets", () => {
  assertProductionError(
    { JWT_REFRESH_SECRET: BASE_ENV.JWT_ACCESS_SECRET },
    "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ",
  );
});

test("production requires HTTPS origins for CORS_ORIGINS and FRONTEND_URL", () => {
  assertProductionError(
    { CORS_ORIGINS: "https://frontend.example,http://insecure.example" },
    "CORS_ORIGINS must contain only https:// origins",
  );
  assertProductionError(
    { FRONTEND_URL: "http://insecure.example" },
    "FRONTEND_URL must contain only https:// origins",
  );
});

test("production rejects a configured ML service key shorter than 32 characters", () => {
  assertProductionError(
    { ML_SERVICE_API_KEY: "short-key" },
    "ML_SERVICE_API_KEY must be at least 32 characters when set",
  );
});

test("production rejects COOKIE_SECURE explicitly set to false", () => {
  assertProductionError(
    { COOKIE_SECURE: "false" },
    "COOKIE_SECURE must not be false in production",
  );
});

test("development and test environments do not apply production-only checks", () => {
  for (const NODE_ENV of ["development", "test"]) {
    withEnvironment(
      {
        NODE_ENV,
        CORS_ORIGINS: "http://localhost:3000",
        FRONTEND_URL: "http://localhost:3000",
        JWT_ACCESS_SECRET: "development-secret",
        JWT_REFRESH_SECRET: "development-secret",
        ML_SERVICE_API_KEY: "short",
        COOKIE_SECURE: "false",
      },
      () => {
        assert.equal(loadEnv().NODE_ENV, NODE_ENV);
      },
    );
  }
});
