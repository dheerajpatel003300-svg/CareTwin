const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { createDashboardController } = require("../controllers/dashboard.controller");

function createDashboardRouter({ prisma }) {
  const router = express.Router();
  const controller = createDashboardController({ prisma });

  router.get("/", requireAuth, controller.summary);

  return router;
}

module.exports = { createDashboardRouter };