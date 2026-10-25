const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SENTRY_DSN: z.string().optional().default(""),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  COOKIE_SECURE: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  COOKIE_DOMAIN: z.string().optional().default(""),
});

function loadEnv() {
  if (process.env.NODE_ENV === "production") {
    const productionIssues = [];
    const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

    for (const [name, secret] of [
      ["JWT_ACCESS_SECRET", jwtAccessSecret],
      ["JWT_REFRESH_SECRET", jwtRefreshSecret],
    ]) {
      if (typeof secret !== "string" || secret.length < 32) {
        productionIssues.push(`${name} must be at least 32 characters`);
      } else if (/change-me|changeme/i.test(secret)) {
        productionIssues.push(`${name} must not contain a placeholder`);
      }
    }

    if (
      typeof jwtAccessSecret === "string" &&
      typeof jwtRefreshSecret === "string" &&
      jwtAccessSecret === jwtRefreshSecret
    ) {
      productionIssues.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
    }

    for (const name of ["CORS_ORIGINS", "FRONTEND_URL"]) {
      const value = process.env[name];
      if (!value) continue;

      const invalidOrigins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .some((origin) => !origin.startsWith("https://"));
      if (invalidOrigins) {
        productionIssues.push(`${name} must contain only https:// origins`);
      }
    }

    const mlServiceApiKey = process.env.ML_SERVICE_API_KEY;
    if (mlServiceApiKey !== undefined && mlServiceApiKey.length < 32) {
      productionIssues.push("ML_SERVICE_API_KEY must be at least 32 characters when set");
    }

    if (process.env.COOKIE_SECURE?.trim().toLowerCase() === "false") {
      productionIssues.push("COOKIE_SECURE must not be false in production");
    }

    if (process.env.STORAGE_PROVIDER === "s3") {
      for (const name of [
        "S3_BUCKET",
        "S3_ENDPOINT",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ]) {
        if (!process.env[name]?.trim()) {
          productionIssues.push(`${name} must be set when STORAGE_PROVIDER=s3`);
        }
      }
      if (process.env.S3_ENDPOINT && !process.env.S3_ENDPOINT.startsWith("https://")) {
        productionIssues.push("S3_ENDPOINT must start with https:// when STORAGE_PROVIDER=s3");
      }
    }

    if (productionIssues.length > 0) {
      throw new Error(`Invalid production environment variables: ${productionIssues.join("; ")}`);
    }
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }

  return {
    ...parsed.data,
    corsOrigins: parsed.data.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

module.exports = { loadEnv };
