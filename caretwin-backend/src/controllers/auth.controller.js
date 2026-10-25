const authService = require("../services/auth.service");
const {
  rotateRefreshToken,
  revokeRefreshToken,
} = require("../services/token.service");
const { signAccessToken } = require("../utils/jwt");
const { logAudit } = require("../services/audit.service");
const { queuePasswordResetEmail } = require("../services/email.service");
const { setRefreshCookie, clearRefreshCookie } = require("../utils/cookies");

const REFRESH_COOKIE = "refreshToken";

// Forwards async errors to your error middleware (works on Express 4 and 5)
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createAuthController({ prisma }) {
  const audit = (req, userId, action) =>
    logAudit(prisma, {
      userId,
      action,
      resourceType: "user",
      resourceId: userId,
      ipAddress: req.ip,
    });

  const register = asyncHandler(async (req, res) => {
    await authService.register(prisma, req.body);

    // Same response whether or not the email already existed
    res.status(201).json({
      success: true,
      data: {
        message: "If this email can be registered, you can now sign in.",
      },
    });
  });

  const verifyEmail = asyncHandler(async (req, res) => {
    const userId = await authService.verifyEmail(prisma, req.body.token);
    await audit(req, userId, "auth.email_verified");
    res.json({ success: true, data: { message: "Email verified" } });
  });

  const resendVerification = asyncHandler(async (req, res) => {
    const result = await authService.resendVerification(prisma, req.body.email);
    if (result) queueVerificationEmail(result.user.email, result.verifyToken);

    // Same response whether or not the account exists or is already verified
    res.json({
      success: true,
      data: { message: "If this account needs verification, a new link has been sent." },
    });
  });

  const login = asyncHandler(async (req, res) => {
    const { user, accessToken, refreshToken, refreshExpiresAt } =
      await authService.login(prisma, req.body);

    setRefreshCookie(res, refreshToken, refreshExpiresAt);
    await audit(req, user.id, "auth.login");
    res.json({ success: true, data: { user, accessToken } });
  });

  const refresh = asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) {
      const err = new Error("Refresh token missing");
      err.statusCode = 401;
      throw err;
    }

    try {
      const { rawToken, record } = await rotateRefreshToken(prisma, raw);
      setRefreshCookie(res, rawToken, record.expiresAt);
      res.json({
        success: true,
        data: { accessToken: signAccessToken(record.userId) },
      });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  });

  const logout = asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await revokeRefreshToken(prisma, raw);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  const me = asyncHandler(async (req, res) => {
    const user = await authService.getMe(prisma, req.userId);
    res.json({ success: true, data: { user } });
  });

  const forgotPassword = asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword(prisma, req.body.email);
    if (result) queuePasswordResetEmail(result.user.email, result.resetToken);

    // Same response whether or not the account exists
    res.json({
      success: true,
      data: { message: "If an account exists, a reset link has been sent." },
    });
  });

  const resetPassword = asyncHandler(async (req, res) => {
    const userId = await authService.resetPassword(
      prisma,
      req.body.token,
      req.body.newPassword
    );
    await audit(req, userId, "auth.password_reset");
    clearRefreshCookie(res);
    res.json({
      success: true,
      data: { message: "Password updated. Please log in again." },
    });
  });

  return {
    register,
    verifyEmail,
    resendVerification,
    login,
    refresh,
    logout,
    me,
    forgotPassword,
    resetPassword,
  };
}

module.exports = { createAuthController };