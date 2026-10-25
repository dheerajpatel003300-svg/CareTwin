const { z } = require("zod");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .max(254);

// bcrypt silently ignores everything after 72 BYTES, so cap by bytes, not characters
const withinBcryptLimit = (value) => Buffer.byteLength(value, "utf8") <= 72;

const newPassword = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .refine(withinBcryptLimit, "Password is too long (max 72 bytes)")
  .refine((v) => /[a-z]/.test(v), "Password needs a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Password needs an uppercase letter")
  .refine((v) => /[0-9]/.test(v), "Password needs a number");

// Login must NOT enforce the new-password policy, so older accounts can still sign in
const loginPassword = z
  .string()
  .min(1, "Password is required")
  .refine(withinBcryptLimit, "Invalid credentials");

// Raw tokens are 32 random bytes as hex = 64 characters
const rawToken = z
  .string()
  .length(64, "Invalid token")
  .regex(/^[a-f0-9]+$/, "Invalid token");

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date of birth")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => value <= new Date(), "Date of birth cannot be in the future")
  .refine((value) => value.getUTCFullYear() >= 1900, "Date of birth is too far in the past");

const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(50),
    lastName: z.string().trim().min(1, "Last name is required").max(50),
    email,
    password: newPassword,
    dateOfBirth,
    gender: z.enum(["female", "male", "other", "prefer_not_to_say"]),
  })
  .strict();

const loginSchema = z
  .object({
    email,
    password: loginPassword,
  })
  .strict();

const forgotPasswordSchema = z.object({ email }).strict();

const resetPasswordSchema = z
  .object({
    token: rawToken,
    newPassword,
  })
  .strict();

const verifyEmailSchema = z.object({ token: rawToken }).strict();

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
};