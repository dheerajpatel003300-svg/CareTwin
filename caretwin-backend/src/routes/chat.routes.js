const express = require("express");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  createChatSchema,
  sendMessageSchema,
  chatIdParamSchema,
  listChatsQuerySchema,
} = require("../validators/chat.validator");
const { createChatController } = require("../controllers/chat.controller");

function createChatRouter({ prisma, redis }) {
  const router = express.Router();
  const controller = createChatController({ prisma });

  // 15 messages per minute per client; the daily cap is enforced per user in the service
  const messageLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: "rl:chat:",
      sendCommand: (...args) => redis.call(...args),
    }),
  });

  router.use(requireAuth);

  router.get("/", validate(listChatsQuerySchema, "query"), controller.list);
  router.post("/", validate(createChatSchema), controller.create);
  router.get("/:id", validate(chatIdParamSchema, "params"), controller.get);
  router.delete("/:id", validate(chatIdParamSchema, "params"), controller.remove);
  router.post(
    "/:id/messages",
    messageLimiter,
    validate(chatIdParamSchema, "params"),
    validate(sendMessageSchema),
    controller.sendMessage
  );

  return router;
}

module.exports = { createChatRouter };