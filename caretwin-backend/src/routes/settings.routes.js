const express = require("express");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { changePasswordSchema, deleteAccountSchema } = require("../validators/settings.validator");
const { createSettingsController } = require("../controllers/settings.controller");

function createSettingsRouter({ prisma, redis, env }) {
  const router = express.Router();
  const controller = createSettingsController({ prisma, env });

  // Stops someone with a stolen access token from guessing the current password
  const sensitiveLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: "rl:settings:",
      sendCommand: (...args) => redis.call(...args),
    }),
  });

  router.use(requireAuth);

  router.post("/password", sensitiveLimiter, validate(changePasswordSchema), controller.changePassword);
  router.post("/logout-all", controller.logoutAll);
  router.post("/delete-account", sensitiveLimiter, validate(deleteAccountSchema), controller.deleteAccount);

  return router;
}

module.exports = { createSettingsRouter };