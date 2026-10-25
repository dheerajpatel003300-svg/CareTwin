const MAX_OPEN_TICKETS = 5;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const SELECT = {
  id: true,
  subject: true,
  description: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
};

async function createTicket(prisma, userId, data) {
  const open = await prisma.supportTicket.count({
    where: { userId, status: { in: ["open", "in_progress"] } },
  });
  if (open >= MAX_OPEN_TICKETS) {
    throw httpError(429, "You have too many open tickets. Please wait for one to be resolved or close one.");
  }
  return prisma.supportTicket.create({ data: { userId, ...data }, select: SELECT });
}

async function listTickets(prisma, userId, { limit, cursor, status }) {
  const rows = await prisma.supportTicket.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: SELECT,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

// Not found and not yours look identical (404)
async function getTicket(prisma, userId, id) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id, userId }, select: SELECT });
  if (!ticket) throw httpError(404, "Ticket not found");
  return ticket;
}

async function closeTicket(prisma, userId, id) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, userId },
    select: { status: true },
  });
  if (!ticket) throw httpError(404, "Ticket not found");
  if (ticket.status === "closed") throw httpError(409, "Ticket is already closed");

  // Conditional update: only one concurrent request can win
  const { count } = await prisma.supportTicket.updateMany({
    where: { id, userId, status: { not: "closed" } },
    data: { status: "closed" },
  });
  if (count === 0) throw httpError(409, "Ticket is already closed");
  return getTicket(prisma, userId, id);
}

module.exports = { createTicket, listTickets, getTicket, closeTicket };