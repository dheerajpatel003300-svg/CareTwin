const fileService = require("../services/recordFile.service");
const { logAudit } = require("../services/audit.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createRecordFileController({ prisma }) {
  const audit = (req, action, resourceId) =>
    logAudit(prisma, {
      userId: req.userId,
      action,
      resourceType: "medical_record_file",
      resourceId,
      ipAddress: req.ip,
    });

  const upload = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { mime, ocr } = await fileService.attachFile(prisma, req.userId, id, req.file);
    await audit(req, "record.file.upload", id);
    res.status(201).json({ success: true, data: { message: "File attached", mime, ocr } });
  });

  const download = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { stream, fileName, mime } = await fileService.getFileForDownload(prisma, req.userId, id);
    await audit(req, "record.file.download", id);

    const ascii = String(fileName).replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: { message: "Could not read file" } });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  });

  const remove = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    await fileService.removeFile(prisma, req.userId, id);
    await audit(req, "record.file.delete", id);
    res.status(204).end();
  });

  return { upload, download, remove };
}

module.exports = { createRecordFileController };