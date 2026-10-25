const settingsService = require("../services/settings.service");
const { logAudit } = require("../services/audit.service");
const { clearRefreshCookie } = require("../utils/cookies");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createSettingsController({ prisma }) {
  const audit = (req, action) =>
    logAudit(prisma, {
      userId: req.userId,
      action,
      resourceType: "user",
      resourceId: req.userId,
      ipAddress: req.ip,
    });

  const changePassword = asyncHandler(async (req, res) => {
    await settingsService.changePassword(prisma, req.userId, req.body.currentPassword, req.body.newPassword);
    await audit(req, "account.password_change");
    clearRefreshCookie(res);
    res.json({ success: true, data: { message: "Password updated. Please log in again." } });
  });

  const logoutAll = asyncHandler(async (req, res) => {
    await settingsService.logoutAll(prisma, req.userId);
    await audit(req, "account.logout_all");
    clearRefreshCookie(res);
    res.json({ success: true, data: { message: "Signed out of all devices." } });
  });

  const deleteAccount = asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { failedFiles } = await settingsService.deleteAccount(prisma, userId, req.body.password);
    // Written after the delete: the user link is already gone, so only the id is recorded
    await logAudit(prisma, {
      userId: null,
      actorId: null,
      action: "account.delete",
      resourceType: "user",
      resourceId: userId,
      ipAddress: req.ip,
    });
    if (failedFiles > 0) console.error(`account ${userId}: ${failedFiles} file(s) need manual cleanup`);
    clearRefreshCookie(res);
    res.json({ success: true, data: { message: "Your account and data have been deleted." } });
  });

  return { changePassword, logoutAll, deleteAccount };
}

module.exports = { createSettingsController };