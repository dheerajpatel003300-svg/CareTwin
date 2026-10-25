const pino = require("pino");

function createLogger(env) {
  return pino({
    level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: {
      paths: [
        "password",
        "passwordHash",
        "token",
        "authorization",
        "cookie",
        "req.headers.authorization",
        "req.headers.cookie",
      ],
      censor: "[REDACTED]",
    },
  });
}

module.exports = { createLogger };
