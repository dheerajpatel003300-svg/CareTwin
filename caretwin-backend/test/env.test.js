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

test("production requires HTTPS S3 configuration when the S3 provider is selected", () => {
  const s3Config = {
    STORAGE_PROVIDER: "s3",
    S3_BUCKET: "private-bucket",
    S3_ENDPOINT: "https://project.example/storage/v1/s3",
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
  };

  withEnvironment(s3Config, () => assert.equal(loadEnv().NODE_ENV, "production"));

  for (const name of ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    const config = { ...s3Config, [name]: "" };
    withEnvironment(config, () => {
      assert.throws(
        () => loadEnv(),
        (error) => {
          assert.match(error.message, new RegExp(`${name} must be set`));
          if (s3Config.S3_SECRET_ACCESS_KEY) {
            assert.equal(error.message.includes(s3Config.S3_SECRET_ACCESS_KEY), false);
          }
          return true;
        }
      );
    });
  }

  for (const endpoint of ["http://project.example/storage/v1/s3", "project.example"]) {
    withEnvironment({ ...s3Config, S3_ENDPOINT: endpoint }, () => {
      assert.throws(
        () => loadEnv(),
        /S3_ENDPOINT must start with https:\/\/ when STORAGE_PROVIDER=s3/
      );
    });
  }
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
