const storage = require("./storage.service");
const { detectFileType } = require("../utils/fileType");
const { enqueueOcrJob } = require("./recordOcr.service");

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Strip path parts and control characters; only ever stored as metadata.
function cleanFileName(name, ext) {
  const base = String(name || "file")
    .replace(/^.*[\\/]/, "")
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 100);
  return base || `file${ext}`;
}

async function attachFile(prisma, userId, recordId, file) {
  if (!file) throw httpError(400, "No file uploaded");

  const type = detectFileType(file.buffer);
  if (!type) throw httpError(415, "Unsupported file type. Allowed: PDF, JPEG, PNG");

  const key = storage.newKey(userId, type.ext);
  await storage.saveFile(key, file.buffer);

  let oldStorageKey;
  try {
    oldStorageKey = await prisma.$transaction(async (tx) => {
      const records = await tx.$queryRaw`
        SELECT "storage_key"
        FROM "medical_records"
        WHERE "id" = ${recordId}::uuid AND "user_id" = ${userId}::uuid AND "deleted_at" IS NULL
        FOR UPDATE
      `;
      if (!records.length) throw httpError(404, "Record not found");
      const previousStorageKey = records[0].storage_key;
      await tx.medicalRecord.update({
        where: { id: recordId },
        data: { storageKey: key, fileName: cleanFileName(file.originalname, type.ext) },
      });
      await tx.recordOcrJob.deleteMany({ where: { recordId } });
      await enqueueOcrJob(tx, userId, recordId, key);
      return previousStorageKey;
    });
  } catch (err) {
    await storage.deleteFile(key); // do not leave an orphan file behind
    throw err;
  }

  if (oldStorageKey) await storage.deleteFile(oldStorageKey); // replaced file
  return { mime: type.mime, ocr: { status: "queued" } };
}

async function getFileForDownload(prisma, userId, recordId) {
  const record = await prisma.medicalRecord.findFirst({
    where: { id: recordId, userId, deletedAt: null },
    select: { storageKey: true, fileName: true },
  });
  if (!record || !record.storageKey) throw httpError(404, "File not found");

  const ext = record.storageKey.slice(record.storageKey.lastIndexOf("."));
  const mime =
    ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";

  const stream = await storage.openReadStream(record.storageKey);
  return { stream, fileName: record.fileName, mime };
}

async function removeFile(prisma, userId, recordId) {
  const storageKey = await prisma.$transaction(async (tx) => {
    const records = await tx.$queryRaw`
      SELECT "storage_key"
      FROM "medical_records"
      WHERE "id" = ${recordId}::uuid AND "user_id" = ${userId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    const currentStorageKey = records[0]?.storage_key;
    if (!currentStorageKey) throw httpError(404, "File not found");
    await tx.medicalRecord.update({
      where: { id: recordId },
      data: { storageKey: null, fileName: null },
    });
    await tx.recordOcrJob.deleteMany({ where: { recordId } });
    return currentStorageKey;
  });
  await storage.deleteFile(storageKey);
}

module.exports = { attachFile, getFileForDownload, removeFile };