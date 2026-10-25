function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const SELECT = {
  id: true,
  title: true,
  message: true,
  type: true,
  isRead: true,
  createdAt: true,
};

// Cursor pagination: newest first. Fetch one extra row to know if there is a next page.
async function listNotifications(prisma, userId, { limit, cursor, unread }) {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(unread ? { isRead: false } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: SELECT,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

async function getUnreadCount(prisma, userId) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

async function markRead(prisma, userId, id) {
  // userId in the filter = ownership check. Already-read rows still match, so this is idempotent.
  const { count } = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  if (count === 0) throw httpError(404, "Notification not found");
}

async function markAllRead(prisma, userId) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return count;
}

// Used by other services (welcome message, symptom results, support replies...)
async function createNotification(prisma, userId, { title, message, type }) {
  return prisma.notification.create({
    data: { userId, title, message, type },
    select: SELECT,
  });
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  createNotification,
};