const { z } = require("zod");

const RECORD_TYPES = [
  "lab_report",
  "prescription",
  "imaging",
  "discharge_summary",
  "vaccination",
  "insurance",
  "other",
];

// YYYY-MM-DD, not in the future
const recordDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "Invalid date")
  .refine((d) => d.getUTCFullYear() >= 1900, "Record date is too far in the past");

const text = (max) => z.string().trim().min(1).max(max);
const timeZoneOffsetMinutes = z.number().int().min(-840).max(840).default(0);

function isRecordDateNotFuture(date, offsetMinutes, now = Date.now()) {
  const localNow = new Date(now - offsetMinutes * 60_000);
  return date.toISOString().slice(0, 10) <= localNow.toISOString().slice(0, 10);
}

function withLocalDateValidation(schema) {
  return schema
    .superRefine((value, ctx) => {
      if (value.recordDate && !isRecordDateNotFuture(value.recordDate, value.timeZoneOffsetMinutes)) {
        ctx.addIssue({
          code: "custom",
          path: ["recordDate"],
          message: "Record date cannot be in the future",
        });
      }
    })
    .transform(({ timeZoneOffsetMinutes, ...record }) => record);
}

const createRecordSchema = withLocalDateValidation(z
  .object({
    title: text(200),
    recordType: z.enum(RECORD_TYPES),
    familyMemberId: z.string().uuid().optional(),
    description: z.string().trim().max(2000).optional(),
    doctorName: text(100).optional(),
    hospitalName: text(150).optional(),
    recordDate: recordDate.optional(),
    timeZoneOffsetMinutes,
  })
  .strict());

// All optional; null clears the optional fields
const updateRecordSchema = withLocalDateValidation(z
  .object({
    title: text(200).optional(),
    recordType: z.enum(RECORD_TYPES).optional(),
    familyMemberId: z.string().uuid().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    doctorName: text(100).nullable().optional(),
    hospitalName: text(150).nullable().optional(),
    recordDate: recordDate.nullable().optional(),
    timeZoneOffsetMinutes,
  })
  .strict()
  .refine((obj) => Object.keys(obj).some((key) => key !== "timeZoneOffsetMinutes"), "Provide at least one field to update"));

const listRecordsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().optional(),
    recordType: z.enum(RECORD_TYPES).optional(),
    familyMemberId: z.string().uuid().optional(),
  })
  .strict();

const recordIdParamSchema = z.object({ id: z.string().uuid("Invalid id") }).strict();

module.exports = {
  RECORD_TYPES,
  createRecordSchema,
  updateRecordSchema,
  listRecordsQuerySchema,
  recordIdParamSchema,
  isRecordDateNotFuture,
};