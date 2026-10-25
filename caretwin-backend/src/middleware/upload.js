const multer = require("multer");

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Memory storage is fine at this size; the buffer is validated before anything touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 0 },
});

// Wraps multer so its errors become clean 400s through your error handler.
function singleFile(fieldName = "file") {
  const handler = upload.single(fieldName);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();
      const e = new Error(
        err.code === "LIMIT_FILE_SIZE"
          ? "File too large (max 10 MB)"
          : "Invalid upload: send one file in the 'file' field"
      );
      e.statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      next(e);
    });
  };
}

module.exports = { singleFile };