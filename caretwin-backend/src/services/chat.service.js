const { checkEmergency } = require("./chatSafety.service");
const { isHealthRelated } = require("./chatScope.service");
const { getRecentReportContext, isReportRelated } = require("./chatReportContext.service");
const llm = require("./llm.service");

const DAILY_MESSAGE_CAP = 50;
const HISTORY_FOR_MODEL = 10;
const OUT_OF_SCOPE_REPLY =
  "I can only help with health and medical topics. Please ask a health-related question.";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const CHAT_SELECT = { id: true, title: true, createdAt: true, updatedAt: true };
const MSG_SELECT = { id: true, sender: true, message: true, createdAt: true };

async function createChat(prisma, userId, title) {
  return prisma.chat.create({ data: { userId, title: title ?? null }, select: CHAT_SELECT });
}

async function listChats(prisma, userId, { limit, cursor }) {
  const rows = await prisma.chat.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: CHAT_SELECT,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

// Not found and not yours look identical (404)
async function getChat(prisma, userId, id) {
  const chat = await prisma.chat.findFirst({
    where: { id, userId },
    select: {
      ...CHAT_SELECT,
      messages: { orderBy: { createdAt: "asc" }, take: 200, select: MSG_SELECT },
    },
  });
  if (!chat) throw httpError(404, "Chat not found");
  return chat;
}

async function deleteChat(prisma, userId, id) {
  const { count } = await prisma.chat.deleteMany({ where: { id, userId } }); // messages cascade
  if (count === 0) throw httpError(404, "Chat not found");
}

async function sendMessage(prisma, userId, chatId, text) {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, userId },
    select: { id: true, title: true },
  });
  if (!chat) throw httpError(404, "Chat not found");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.chatMessage.count({
    where: { sender: "user", createdAt: { gte: since }, chat: { userId } },
  });
  if (used >= DAILY_MESSAGE_CAP) {
    throw httpError(429, "Daily message limit reached. Please try again tomorrow.");
  }

  // Safety first: emergency and crisis wording never reaches the model
  const safety = checkEmergency(text);

  let replyText;
  if (safety) {
    replyText = safety.reply;
  } else {
    const recent = await prisma.chatMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_FOR_MODEL,
      select: { sender: true, message: true },
    });
    const reportConversation =
      isReportRelated(text) ||
      recent.some((message) => message.sender === "user" && isReportRelated(message.message));
    if (!isHealthRelated(text) && !reportConversation) {
      replyText = OUT_OF_SCOPE_REPLY;
    } else {
      const reportContext = reportConversation
        ? await getRecentReportContext(prisma, userId)
        : "";
      replyText = await llm.generateReply({
        history: recent.reverse(),
        userMessage: text,
        reportContext,
      });
    }
  }

  // Explicit, ordered timestamps (a transaction can otherwise share one clock value)
  const now = Date.now();
  const [userMessage, assistantMessage] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: { chatId, sender: "user", message: text, createdAt: new Date(now) },
      select: MSG_SELECT,
    }),
    prisma.chatMessage.create({
      data: { chatId, sender: "assistant", message: replyText, createdAt: new Date(now + 1) },
      select: MSG_SELECT,
    }),
    prisma.chat.update({
      where: { id: chatId },
      data: { title: chat.title ?? text.slice(0, 40) },
    }),
  ]);

  return {
    userMessage,
    assistantMessage,
    emergency: safety ? { id: safety.id, kind: safety.kind } : null,
  };
}

module.exports = { createChat, listChats, getChat, deleteChat, sendMessage };