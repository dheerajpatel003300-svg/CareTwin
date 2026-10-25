const { z } = require("zod");

const LABS = [
  "Hemoglobin",
  "Creatinine",
  "Potassium",
  "Urea Nitrogen",
  "Sodium",
  "Glucose",
  "Calcium, Total",
];

const optionalText = z.string().trim().max(80).optional();
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date");

// Lab values are chronological measurements from the observation window.
// Plausible-range checks (unit mix-ups) are enforced again by the ML service.
const labsSchema = z
  .record(z.string(), z.array(z.number().finite()).min(1).max(50))
  .refine((labs) => Object.keys(labs).every((k) => LABS.includes(k)), "Unknown lab name");

const mortalityRiskSchema = z
  .object({
    age: z.number().min(0).max(120),
    gender: z.enum(["F", "M"]).optional(),
    admissionDate: dateOnly.optional(),
    admissionTime: z.string().datetime({ offset: true }).or(z.string().datetime({ local: true })).optional(),
    admissionType: optionalText,
    admissionLocation: optionalText,
    insurance: optionalText,
    language: optionalText,
    maritalStatus: optionalText,
    race: optionalText,
    labs: labsSchema.default({}),
  })
  .strict()
  .refine((input) => input.admissionDate || input.admissionTime, {
    path: ["admissionDate"],
    message: "Provide an admission date",
  });

module.exports = { mortalityRiskSchema, LABS };
