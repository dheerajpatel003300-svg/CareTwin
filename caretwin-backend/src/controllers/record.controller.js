const recordService = require("../services/record.service");
const { logAudit } = require("../services/audit.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createRecordController({ prisma }) {
  const audit = (req, action, resourceId) =>
    logAudit(prisma, {
      userId: req.userId,
      action,
      resourceType: "medical_record",
      resourceId,
      ipAddress: req.ip,
    });

  const create = asyncHandler(async (req, res) => {
    const record = await recordService.createRecord(prisma, req.userId, req.body);
    await audit(req, "record.create", record.id);
    res.status(201).json({ success: true, data: { record } });
  });

  const list = asyncHandler(async (req, res) => {
    const data = await recordService.listRecords(prisma, req.userId, req.validated.query);
    res.json({ success: true, data });
  });

  const get = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const record = await recordService.getRecord(prisma, req.userId, id);
    await audit(req, "record.view", id);
    res.json({ success: true, data: { record } });
  });

  const update = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const record = await recordService.updateRecord(prisma, req.userId, id, req.body);
    await audit(req, "record.update", id);
    res.json({ success: true, data: { record } });
  });

  const remove = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    await recordService.deleteRecord(prisma, req.userId, id);
    await audit(req, "record.delete", id);
    res.status(204).end();
  });

  return { create, list, get, update, remove };
}

module.exports = { createRecordController };