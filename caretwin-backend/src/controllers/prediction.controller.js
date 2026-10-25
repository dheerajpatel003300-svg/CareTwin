const predictionService = require("../services/prediction.service");
const { logAudit } = require("../services/audit.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createPredictionController({ prisma }) {
  const schema = asyncHandler(async (req, res) => {
    res.json({ success: true, data: await predictionService.getSchema() });
  });

  const mortality = asyncHandler(async (req, res) => {
    const result = await predictionService.predictMortality(req.body);
    // Audit records who ran a prediction, never the inputs or the score.
    await logAudit(prisma, {
      userId: req.userId,
      action: "prediction.mortality",
      resourceType: "prediction",
      ipAddress: req.ip,
    });
    res.json({ success: true, data: { result } });
  });

  return { schema, mortality };
}

module.exports = { createPredictionController };
