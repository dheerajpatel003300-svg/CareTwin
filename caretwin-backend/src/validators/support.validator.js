const { z } = require("zod");

const createTicketSchema = z
  .object({
    subject: z.string().trim().min(3, "Subject is too short").max(120),
    description: z.string().trim().min(10, "Please describe the problem in a few words").max(3000),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  })
  .strict();

const ticketIdParamSchema = z.object({ id: z.string().uuid("Invalid id") }).strict();

const listTicketsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().optional(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  })
  .strict();

module.exports = { createTicketSchema, ticketIdParamSchema, listTicketsQuerySchema };