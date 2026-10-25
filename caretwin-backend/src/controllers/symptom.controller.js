const symptomService = require("../services/symptom.service");
const { logAudit } = require("../services/audit.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createSymptomController({ prisma }) {
  const vocabulary = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { symptoms: symptomService.listVocabulary() } });
  });

  const check = asyncHandler(async (req, res) => {
    const result = await symptomService.runCheck(prisma, req.userId, req.body);
    await logAudit(prisma, {
      userId: req.userId,
      action: "symptom.check",
      resourceType: "symptom_check",
      resourceId: result.id,
      ipAddress: req.ip,
    });
    res.status(201).json({ success: true, data: { result } });
  });

  const history = asyncHandler(async (req, res) => {
    const data = await symptomService.listHistory(prisma, req.userId, req.validated.query);
    res.json({ success: true, data });
  });

  return { vocabulary, check, history };
}

module.exports = { createSymptomController };