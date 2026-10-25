const service = require("../services/notification.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createNotificationController({ prisma }) {
  const list = asyncHandler(async (req, res) => {
    const data = await service.listNotifications(prisma, req.userId, req.validated.query);
    res.json({ success: true, data });
  });

  const unreadCount = asyncHandler(async (req, res) => {
    const count = await service.getUnreadCount(prisma, req.userId);
    res.json({ success: true, data: { count } });
  });

  const markRead = asyncHandler(async (req, res) => {
    await service.markRead(prisma, req.userId, req.validated.params.id);
    res.json({ success: true, data: { message: "Marked as read" } });
  });

  const markAllRead = asyncHandler(async (req, res) => {
    const updated = await service.markAllRead(prisma, req.userId);
    res.json({ success: true, data: { updated } });
  });

  return { list, unreadCount, markRead, markAllRead };
}

module.exports = { createNotificationController };