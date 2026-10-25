const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const pinoHttp = require("pino-http");
const { requestIdMiddleware } = require("./middleware/requestId.middleware");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");
const { checkDatabase } = require("./config/db");
const { checkRedis } = require("./config/redis");
const { success } = require("./utils/response");
const { createAuthRouter } = require("./routes/auth.routes");
const { createUserRouter } = require("./routes/user.routes");
const { createFamilyMemberRouter } = require("./routes/familyMember.routes");
const { createNotificationRouter } = require("./routes/notification.routes");
const { createDashboardRouter } = require("./routes/dashboard.routes");
const { createRecordRouter } = require("./routes/record.routes");
const { createSymptomRouter } = require("./routes/symptom.routes");
const { createChatRouter } = require("./routes/chat.routes");
const { createSettingsRouter } = require("./routes/settings.routes");
const { createSupportRouter } = require("./routes/support.routes");
const { createPredictionRouter } = require("./routes/prediction.routes");

function createApp({ env, logger, prisma, redis }) {
  const app = express();

  // Number of proxies in front of the app. Render alone = 1. Vercel proxy + Render = 2 (verify, see below).
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
  app.disable("x-powered-by");

  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.requestId,
      customProps: (req) => ({ requestId: req.requestId }),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          return callback(null, true);
        }
        if (env.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("CORS origin not allowed"));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
    }),
  });
  app.use(limiter);

  app.get("/health", (req, res) => {
    success(res, { status: "ok", uptime: process.uptime() });
  });

  app.get("/health/ready", async (req, res, next) => {
    const checks = { database: "down", redis: "down" };

    try {
      await checkDatabase(prisma);
      checks.database = "up";
    } catch (err) {
      req.log.error({ err }, "database readiness check failed");
    }

    try {
      await checkRedis(redis);
      checks.redis = "up";
    } catch (err) {
      req.log.error({ err }, "redis readiness check failed");
    }

    if (checks.database !== "up" || checks.redis !== "up") {
      const error = new Error("Service not ready");
      error.statusCode = 503;
      return res.status(503).json({
        success: false,
        error: { message: error.message },
        data: checks,
        requestId: req.requestId,
      });
    }

    success(res, { status: "ready", ...checks });
  });

  app.use("/auth", createAuthRouter({ prisma, redis, env }));
  app.use("/users", createUserRouter({ prisma }));
  app.use("/family-members", createFamilyMemberRouter({ prisma }));
  app.use("/notifications", createNotificationRouter({ prisma }));
  app.use("/dashboard", createDashboardRouter({ prisma }));
  app.use("/records", createRecordRouter({ prisma, redis }));
  app.use("/symptoms", createSymptomRouter({ prisma }));
  app.use("/chats", createChatRouter({ prisma, redis }));
  app.use("/settings", createSettingsRouter({ prisma, redis, env }));
  app.use("/support", createSupportRouter({ prisma, redis }));
  app.use("/predictions", createPredictionRouter({ prisma }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger, env));

  return app;
}

module.exports = { createApp };