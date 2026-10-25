const { z } = require("zod");

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => value <= new Date(), "Date of birth cannot be in the future")
  .refine((value) => value.getUTCFullYear() >= 1900, "Date of birth is too far in the past");

const plainText = (max) =>
  z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const name = plainText(100);
const relationship = plainText(50);
const gender = z.enum(["female", "male", "other", "prefer_not_to_say"]);

const createFamilyMemberSchema = z
  .object({
    name,
    relationship,
    dateOfBirth: dateOfBirth.optional(),
    gender: gender.optional(),
  })
  .strict();

const updateFamilyMemberSchema = z
  .object({
    name: name.optional(),
    relationship: relationship.optional(),
    dateOfBirth: dateOfBirth.nullable().optional(),
    gender: gender.nullable().optional(),
  })
  .strict()
  .refine((member) => Object.keys(member).length > 0, "Provide at least one field to update");

const familyMemberIdParamSchema = z
  .object({ id: z.string().uuid("Invalid id") })
  .strict();

module.exports = {
  createFamilyMemberSchema,
  updateFamilyMemberSchema,
  familyMemberIdParamSchema,
};
