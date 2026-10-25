const authService = require("../services/auth.service");
const userService = require("../services/user.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createUserController({ prisma }) {
  const getProfile = asyncHandler(async (req, res) => {
    const user = await authService.getMe(prisma, req.userId);
    res.json({ success: true, data: { user } });
  });

  const updateProfile = asyncHandler(async (req, res) => {
    const user = await userService.updateProfile(prisma, req.userId, req.body);
    res.json({ success: true, data: { user } });
  });

  return { getProfile, updateProfile };
}

module.exports = { createUserController };