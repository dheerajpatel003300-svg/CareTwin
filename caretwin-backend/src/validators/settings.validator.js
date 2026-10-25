const { z } = require("zod");
const { resetPasswordSchema } = require("./auth.validator");

// Reuse the exact password policy from registration and reset
const newPassword = resetPasswordSchema.shape.newPassword;

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(200),
    newPassword,
  })
  .strict();

const deleteAccountSchema = z
  .object({
    password: z.string().min(1, "Password is required").max(200),
    confirm: z.literal("DELETE", { error: 'Type "DELETE" to confirm' }),
  })
  .strict();

module.exports = { changePasswordSchema, deleteAccountSchema };