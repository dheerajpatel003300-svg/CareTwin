const { z } = require("zod");

const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().optional(),
    unread: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
  })
  .strict();

const idParamSchema = z.object({ id: z.string().uuid("Invalid id") }).strict();

module.exports = { listQuerySchema, idParamSchema };