// One place for refresh-cookie settings, used by every controller that sets or clears it.
// Behind the Vercel proxy the browser sees the path /api/auth, so COOKIE_PATH=/api/auth there.
function cookieOptions(expiresAt) {
  const sameSite = (process.env.COOKIE_SAMESITE || "strict").toLowerCase();
  return {
    httpOnly: true, // browser JavaScript can't read it
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path: process.env.COOKIE_PATH || "/auth",
    expires: expiresAt,
  };
}

const setRefreshCookie = (res, rawToken, expiresAt) =>
  res.cookie("refreshToken", rawToken, cookieOptions(expiresAt));

const clearRefreshCookie = (res) => res.clearCookie("refreshToken", cookieOptions(undefined));

module.exports = { setRefreshCookie, clearRefreshCookie };