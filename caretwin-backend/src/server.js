require("dotenv").config();

const Sentry = require("@sentry/node");
const { loadEnv } = require("./config/env");
const { createLogger } = require("./config/logger");
const { createPrisma } = require("./config/db");
const { createRedis } = require("./config/redis");
const { createApp } = require("./app");
const { ensureRoot } = require("./services/storage.service");
const { startRecordOcrWorker } = require("./services/recordOcr.worker");

async function main() {
  const env = loadEnv();
  const logger = createLogger(env);

  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
    });
  }

  const prisma = createPrisma(logger);
  const redis = createRedis(env, logger);
  await redis.connect();
  await ensureRoot();
  const stopOcrWorker = await startRecordOcrWorker({ prisma, logger });

  const app = createApp({ env, logger, prisma, redis });

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "caretwin backend listening");
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, "shutting down");
    await stopOcrWorker();
    server.close(async () => {
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
