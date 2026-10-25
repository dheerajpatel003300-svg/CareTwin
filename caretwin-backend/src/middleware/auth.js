const { verifyAccessToken } = require("../utils/jwt");

function unauthorized(message) {
  const err = new Error(message);
  err.statusCode = 401;
  return err;
}

// Expects "Authorization: Bearer <accessToken>". Sets req.userId on success.
function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(unauthorized("Authentication required"));
  }

  try {
    req.userId = verifyAccessToken(token).sub;
    return next();
  } catch (err) {
    // Same message for expired, malformed or tampered tokens
    return next(unauthorized("Invalid or expired token"));
  }
}

module.exports = { requireAuth };