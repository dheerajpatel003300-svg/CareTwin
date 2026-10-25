const crypto = require("crypto");

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function parseDurationMs(value) {
  const match = /^(\d+)([smhd])$/.exec(value || "");
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * multipliers[unit];
}

function expiryDate(env = process.env) {
  return new Date(
    Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN || "30d")
  );
}

function unauthorized(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

async function createRefreshToken(prisma, userId, env = process.env) {
  const rawToken = generateRawToken();
  const record = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: expiryDate(env),
    },
  });

  return { rawToken, record };
}

async function revokeRefreshToken(prisma, rawToken) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function revokeAllRefreshTokensForUser(prisma, userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function rotateRefreshToken(prisma, rawToken, env = process.env) {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (!existing) throw unauthorized("Invalid refresh token");

  if (existing.revokedAt) {
    // Already rotated => likely theft, revoke every session.
    // Logout-revoked tokens (no replacedById) are just invalid.
    if (existing.replacedById) {
      await revokeAllRefreshTokensForUser(prisma, existing.userId);
      throw unauthorized("Refresh token reuse detected");
    }
    throw unauthorized("Refresh token revoked");
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw unauthorized("Refresh token expired");
  }

  return prisma.$transaction(async (tx) => {
    // Only one concurrent request can flip revokedAt from null
    const { count } = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw unauthorized("Refresh token already used");

    const rawNext = generateRawToken();
    const record = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashToken(rawNext),
        expiresAt: expiryDate(env),
      },
    });

    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { replacedById: record.id },
    });

    return { rawToken: rawNext, record };
  });
}


module.exports = {
  hashToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
};