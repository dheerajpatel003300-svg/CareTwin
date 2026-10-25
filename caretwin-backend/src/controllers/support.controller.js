const supportService = require("../services/support.service");
const { logAudit } = require("../services/audit.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createSupportController({ prisma }) {
  // Audit entries never contain ticket text
  const audit = (req, action, resourceId) =>
    logAudit(prisma, {
      userId: req.userId,
      action,
      resourceType: "support_ticket",
      resourceId,
      ipAddress: req.ip,
    });

  const create = asyncHandler(async (req, res) => {
    const ticket = await supportService.createTicket(prisma, req.userId, req.body);
    await audit(req, "ticket.create", ticket.id);
    res.status(201).json({ success: true, data: { ticket } });
  });

  const list = asyncHandler(async (req, res) => {
    const data = await supportService.listTickets(prisma, req.userId, req.validated.query);
    res.json({ success: true, data });
  });

  const get = asyncHandler(async (req, res) => {
    const ticket = await supportService.getTicket(prisma, req.userId, req.validated.params.id);
    res.json({ success: true, data: { ticket } });
  });

  const close = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const ticket = await supportService.closeTicket(prisma, req.userId, id);
    await audit(req, "ticket.close", id);
    res.json({ success: true, data: { ticket } });
  });

  return { create, list, get, close };
}

module.exports = { createSupportController };