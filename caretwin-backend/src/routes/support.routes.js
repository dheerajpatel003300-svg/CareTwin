const express = require("express");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const {
  createTicketSchema,
  ticketIdParamSchema,
  listTicketsQuerySchema,
} = require("../validators/support.validator");
const { createSupportController } = require("../controllers/support.controller");

function createSupportRouter({ prisma, redis }) {
  const router = express.Router();
  const controller = createSupportController({ prisma });

  // 10 new tickets per hour per client
  const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: "rl:support:",
      sendCommand: (...args) => redis.call(...args),
    }),
  });

  router.use(requireAuth);

  router.get("/", validate(listTicketsQuerySchema, "query"), controller.list);
  router.post("/", createLimiter, validate(createTicketSchema), controller.create);
  router.get("/:id", validate(ticketIdParamSchema, "params"), controller.get);
  router.post("/:id/close", validate(ticketIdParamSchema, "params"), controller.close);

  return router;
}

module.exports = { createSupportRouter };