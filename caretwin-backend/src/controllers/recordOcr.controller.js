const recordOcrService = require("../services/recordOcr.service");
const { logAudit } = require("../services/audit.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createRecordOcrController({ prisma }) {
  const get = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const result = await recordOcrService.getOcrStatus(prisma, req.userId, id);
    await logAudit(prisma, {
      userId: req.userId,
      action: "record.ocr.view",
      resourceType: "medical_record",
      resourceId: id,
      ipAddress: req.ip,
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ success: true, data: result });
  });

  return { get };
}

module.exports = { createRecordOcrController };
