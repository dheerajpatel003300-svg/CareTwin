const crypto = require("crypto");
const { hashPassword, verifyPassword } = require("../utils/password");
const { signAccessToken } = require("../utils/jwt");
const { createRefreshToken, hashToken } = require("./token.service");

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Used so a login for an unknown email takes as long as a real one (no user enumeration by timing)
let dummyHashPromise;
function getDummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword("dummy-password-for-timing");
  return dummyHashPromise;
}

// Returns the new user on success, or null if the email is already taken.
// The controller responds with the SAME message either way (prevents email enumeration).
async function register(prisma, { email, password, firstName, lastName, dateOfBirth, gender }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return null;

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          dateOfBirth,
          gender,
        },
        select: { id: true, email: true, firstName: true, lastName: true, dateOfBirth: true, gender: true },
      });
      await tx.familyMember.create({
        data: {
          userId: created.id,
          name: [firstName, lastName].filter(Boolean).join(" ") || "Me",
          relationship: "self",
          isSelf: true,
          dateOfBirth,
          gender,
        },
      });
      return created;
    });
    return user;
  } catch (err) {
    if (err.code === "P2002") return null; // two signups raced on the same email
    throw err;
  }
}

// Returns the verified user's id
async function verifyEmail(prisma, rawToken) {
  const invalid = () => httpError(400, "Invalid or expired verification token");

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw invalid();
  }

  await prisma.$transaction(async (tx) => {
    // Only one request can flip usedAt from null
    const { count } = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw invalid();

    await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });

    await tx.notification.create({
      data: {
        userId: record.userId,
        title: "Welcome to CareTwin",
        message: "Your email is verified. Complete your profile to get started.",
        type: "welcome",
      },
    });
  });

  return record.userId;
}

// Returns { user, verifyToken } or null. The controller answers identically either way.
async function resendVerification(prisma, email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || user.emailVerifiedAt) return null;

  const verifyToken = crypto.randomBytes(32).toString("hex");
  await prisma.$transaction([
    // Only the newest link should work
    prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(verifyToken),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    }),
  ]);

  return { user: { id: user.id, email: user.email }, verifyToken };
}

// Returns { user, accessToken, refreshToken, refreshExpiresAt }
async function login(prisma, { email, password }) {
  const invalid = () => httpError(401, "Invalid email or password");

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.deletedAt) {
    await verifyPassword(password, await getDummyHash());
    throw invalid();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw httpError(423, "Account temporarily locked. Try again later.");
  }

  const ok = await verifyPassword(password, user.passwordHash);

  if (!ok) {
    // Atomic increment so parallel guesses can't dodge the counter
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: new Date(Date.now() + LOCK_MS),
        },
      });
    }
    throw invalid();
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  const accessToken = signAccessToken(user.id);
  const refresh = await createRefreshToken(prisma, user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    accessToken,
    refreshToken: refresh.rawToken,
    refreshExpiresAt: refresh.record.expiresAt,
  };
}

async function getMe(prisma, userId) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      firstName: true,
      lastName: true,
      phone: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      heightCm: true,
      weightKg: true,
      allergies: true,
      conditions: true,
      createdAt: true,
    },
  });
  if (!user) throw httpError(404, "User not found");
  return user;
}

// Returns { user, resetToken } or null if no such account.
// The controller must respond identically either way (prevents email enumeration).
async function forgotPassword(prisma, email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) return null;

  const resetToken = crypto.randomBytes(32).toString("hex");

  await prisma.$transaction([
    // Only the newest reset link should work
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(resetToken),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    }),
  ]);

  return { user: { id: user.id, email: user.email }, resetToken };
}

// Returns the user's id
async function resetPassword(prisma, rawToken, newPassword) {
  const invalid = () => httpError(400, "Invalid or expired reset token");

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw invalid();
  }

  const passwordHash = await hashPassword(newPassword); // slow, so do it outside the transaction

  await prisma.$transaction(async (tx) => {
    // Only one request can flip usedAt from null
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw invalid();

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });

    // A password reset signs the user out everywhere
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  return record.userId;
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  getMe,
  forgotPassword,
  resetPassword,
};