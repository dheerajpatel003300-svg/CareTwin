function notFoundHandler(req, res, next) {
  const error = new Error(`Not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(logger, env) {
  return (err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    const statusCode = err.statusCode || 500;
    const payload = {
      success: false,
      error: {
        message:
          env.NODE_ENV === "production" && statusCode === 500
            ? "Internal server error"
            : err.message || "Internal server error",
        ...(err.details && { details: err.details }),
      },
      requestId: req.requestId,
    };

    if (statusCode >= 500) {
      logger.error(
        { err, requestId: req.requestId, method: req.method, url: req.originalUrl, statusCode },
        "request failed"
      );
    } else {
      // Expected client errors: short warn line, no stack trace
      logger.warn(
        { requestId: req.requestId, method: req.method, url: req.originalUrl, statusCode, reason: err.message },
        "request rejected"
      );
    }

    res.status(statusCode).json(payload);
  };
}

module.exports = { notFoundHandler, errorHandler };