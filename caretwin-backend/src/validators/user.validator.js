const { z } = require("zod");

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "Invalid date")
  .refine((d) => d <= new Date(), "Date of birth cannot be in the future")
  .refine((d) => d.getUTCFullYear() >= 1900, "Date of birth is too far in the past");

// Digits with optional leading +, 7 to 15 digits (E.164 style); spaces and dashes are stripped first
const phone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => /^\+?[0-9]{7,15}$/.test(s), "Invalid phone number");

const profileList = z.array(z.string().trim().min(1).max(100)).max(50);

// All fields optional. null clears scalar profile fields; empty arrays clear lists.
const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name cannot be empty").max(50).optional(),
    lastName: z.string().trim().min(1, "Last name cannot be empty").max(50).optional(),
    phone: phone.nullable().optional(),
    dateOfBirth: dateOnly.nullable().optional(),
    gender: z.enum(["female", "male", "other", "prefer_not_to_say"]).nullable().optional(),
    bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullable().optional(),
    heightCm: z.number().min(30).max(250).nullable().optional(),
    weightKg: z.number().min(1).max(500).nullable().optional(),
    allergies: profileList.optional(),
    conditions: profileList.optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, "Provide at least one field to update");

module.exports = { updateProfileSchema };
