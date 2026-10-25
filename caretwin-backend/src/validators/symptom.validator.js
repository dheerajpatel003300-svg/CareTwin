const { z } = require("zod");
const { SYMPTOMS } = require("../data/symptomRules");

const symptomIds = Object.keys(SYMPTOMS);

const checkSymptomsSchema = z
  .object({
    symptoms: z
      .array(z.enum(symptomIds))
      .min(1, "Select at least one symptom")
      .max(15, "Too many symptoms selected")
      .transform((arr) => [...new Set(arr)]),
    severity: z.enum(["low", "medium", "high"]),
    durationDays: z.number().int().min(0).max(3650).default(1),
  })
  .strict();

const historyQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().optional(),
  })
  .strict();

module.exports = { checkSymptomsSchema, historyQuerySchema };