// validate(schema, source = "body")
// - "body": req.body is replaced with the cleaned data
// - "query" | "params": cleaned data goes to req.validated[source]
function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});

    if (!result.success) {
      const err = new Error("Validation failed");
      err.statusCode = 400;
      err.details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      return next(err);
    }

    if (source === "body") {
      req.body = result.data;
    } else {
      req.validated = { ...(req.validated || {}), [source]: result.data };
    }
    next();
  };
}

module.exports = { validate };