const { z } = require("zod");

const createChatSchema = z
  .object({ title: z.string().trim().min(1).max(100).optional() })
  .strict();

const sendMessageSchema = z
  .object({ message: z.string().trim().min(1, "Message cannot be empty").max(2000, "Message is too long (max 2000 characters)") })
  .strict();

const chatIdParamSchema = z.object({ id: z.string().uuid("Invalid id") }).strict();

const listChatsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().optional(),
  })
  .strict();

module.exports = {
  createChatSchema,
  sendMessageSchema,
  chatIdParamSchema,
  listChatsQuerySchema,
};