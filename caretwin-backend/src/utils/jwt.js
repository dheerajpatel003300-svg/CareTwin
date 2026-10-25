const jwt = require("jsonwebtoken");
function signAccessToken(userId, env = process.env) {
  return jwt.sign(
    { sub: userId },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN || "15m" }
  );
}
function verifyAccessToken(token, env = process.env) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}
module.exports = { signAccessToken, verifyAccessToken };