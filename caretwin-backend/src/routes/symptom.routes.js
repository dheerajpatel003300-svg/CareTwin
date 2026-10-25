const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { checkSymptomsSchema, historyQuerySchema } = require("../validators/symptom.validator");
const { createSymptomController } = require("../controllers/symptom.controller");

function createSymptomRouter({ prisma }) {
  const router = express.Router();
  const controller = createSymptomController({ prisma });

  router.use(requireAuth);

  router.get("/vocabulary", controller.vocabulary);
  router.post("/check", validate(checkSymptomsSchema), controller.check);
  router.get("/history", validate(historyQuerySchema, "query"), controller.history);

  return router;
}

module.exports = { createSymptomRouter };