const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { listQuerySchema, idParamSchema } = require("../validators/notification.validator");
const { createNotificationController } = require("../controllers/notification.controller");

function createNotificationRouter({ prisma }) {
  const router = express.Router();
  const controller = createNotificationController({ prisma });

  router.use(requireAuth);

  router.get("/", validate(listQuerySchema, "query"), controller.list);
  router.get("/unread-count", controller.unreadCount);
  router.post("/read-all", controller.markAllRead);
  router.patch("/:id/read", validate(idParamSchema, "params"), controller.markRead);

  return router;
}

module.exports = { createNotificationRouter };
