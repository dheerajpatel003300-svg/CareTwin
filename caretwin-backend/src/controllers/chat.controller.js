const chatService = require("../services/chat.service");
const { logAudit } = require("../services/audit.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createChatController({ prisma }) {
  // Audit entries never contain message text
  const audit = (req, action, resourceId) =>
    logAudit(prisma, {
      userId: req.userId,
      action,
      resourceType: "chat",
      resourceId,
      ipAddress: req.ip,
    });

  const create = asyncHandler(async (req, res) => {
    const chat = await chatService.createChat(prisma, req.userId, req.body.title);
    await audit(req, "chat.create", chat.id);
    res.status(201).json({ success: true, data: { chat } });
  });

  const list = asyncHandler(async (req, res) => {
    const data = await chatService.listChats(prisma, req.userId, req.validated.query);
    res.json({ success: true, data });
  });

  const get = asyncHandler(async (req, res) => {
    const chat = await chatService.getChat(prisma, req.userId, req.validated.params.id);
    await audit(req, "chat.view", chat.id);
    res.json({ success: true, data: { chat } });
  });

  const remove = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    await chatService.deleteChat(prisma, req.userId, id);
    await audit(req, "chat.delete", id);
    res.status(204).end();
  });

  const sendMessage = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const result = await chatService.sendMessage(prisma, req.userId, id, req.body.message);
    await audit(req, "chat.message", id);
    if (result.emergency) await audit(req, "chat.emergency_triggered", id);
    res.status(201).json({ success: true, data: result });
  });

  return { create, list, get, remove, sendMessage };
}

module.exports = { createChatController };