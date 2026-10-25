const Redis = require("ioredis");

function createRedis(env, logger) {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    logger.error({ err }, "redis error");
  });

  return redis;
}

async function checkRedis(redis) {
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error("Redis ping failed");
  }
}

module.exports = { createRedis, checkRedis };
