const { hashPassword, verifyPassword } = require("../utils/password");
const { revokeAllRefreshTokensForUser } = require("./token.service");
const storage = require("./storage.service");

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function loadUser(prisma, userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { passwordHash: true },
  });
  if (!user) throw httpError(404, "User not found");
  return user;
}

async function changePassword(prisma, userId, currentPassword, newPassword) {
  const user = await loadUser(prisma, userId);

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw httpError(400, "Current password is incorrect");
  }
  if (currentPassword === newPassword) {
    throw httpError(400, "New password must be different from the current one");
  }

  const passwordHash = await hashPassword(newPassword); // slow, so outside the transaction

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    // Every device must log in again
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.notification.create({
      data: {
        userId,
        title: "Password changed",
        message: "Your password was changed. If this was not you, reset your password right away.",
        type: "security",
      },
    }),
  ]);
}

async function logoutAll(prisma, userId) {
  await revokeAllRefreshTokensForUser(prisma, userId);
}

async function deleteAccount(prisma, userId, password) {
  const user = await loadUser(prisma, userId);

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw httpError(400, "Password is incorrect");
  }

  // Collect file keys BEFORE the rows disappear (includes soft-deleted records)
  const files = await prisma.medicalRecord.findMany({
    where: { userId, storageKey: { not: null } },
    select: { storageKey: true },
  });

  // Cascades: records, symptom checks, chats and messages, notifications, tickets, tokens.
  // Audit rows stay, with their user link set to null.
  await prisma.user.delete({ where: { id: userId } });

  let failedFiles = 0;
  for (const f of files) {
    try {
      await storage.deleteFile(f.storageKey);
    } catch (err) {
      failedFiles += 1;
      console.error("account deletion: could not remove a file:", err.code || err.message);
    }
  }
  return { failedFiles };
}

module.exports = { changePassword, logoutAll, deleteAccount };