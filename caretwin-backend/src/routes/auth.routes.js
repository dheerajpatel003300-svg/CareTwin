const express = require("express");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validators/auth.validator");
const { createAuthController } = require("../controllers/auth.controller");

function createAuthRouter({ prisma, redis, env }) {
  const router = express.Router();
  const controller = createAuthController({ prisma, env });

  // Stricter than the global limiter (300 / 15 min). Separate prefix = separate counters.
  const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: "rl:auth:",
      sendCommand: (...args) => redis.call(...args),
    }),
  });

  router.post("/register", strictLimiter, validate(registerSchema), controller.register);
  router.post("/verify-email", strictLimiter, validate(verifyEmailSchema), controller.verifyEmail);
  router.post("/resend-verification", strictLimiter, validate(forgotPasswordSchema), controller.resendVerification);
  router.post("/login", strictLimiter, validate(loginSchema), controller.login);
  router.post("/forgot-password", strictLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
  router.post("/reset-password", strictLimiter, validate(resetPasswordSchema), controller.resetPassword);
  router.post("/refresh", controller.refresh);
  router.post("/logout", controller.logout);
  router.get("/me", requireAuth, controller.me);

  return router;
}

module.exports = { createAuthRouter };