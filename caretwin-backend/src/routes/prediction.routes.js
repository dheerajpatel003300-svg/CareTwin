const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { mortalityRiskSchema } = require("../validators/prediction.validator");
const { createPredictionController } = require("../controllers/prediction.controller");

function createPredictionRouter({ prisma }) {
  const router = express.Router();
  const controller = createPredictionController({ prisma });

  const predictLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { message: "Too many requests, please slow down." } },
  });

  router.use(requireAuth);

  router.get("/schema", controller.schema);
  router.post("/mortality", predictLimiter, validate(mortalityRiskSchema), controller.mortality);

  return router;
}

module.exports = { createPredictionRouter };
