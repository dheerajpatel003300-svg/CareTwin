function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toDto(job) {
  return {
    status: job.status,
    ...(job.status === "succeeded"
      ? {
          text: job.text,
          confidence: job.confidence,
          needsReview: job.needsReview,
          flags: job.flags || [],
          quality: job.quality || "unscored",
        }
      : {}),
    ...(job.status === "failed" ? { error: job.errorCode || "OCR_FAILED" } : {}),
    updatedAt: job.updatedAt.toISOString(),
  };
}

const MAX_GLOBAL_ACTIVE_OCR_JOBS = 50;
const MAX_USER_ACTIVE_OCR_JOBS = 5;

async function enqueueOcrJob(tx, userId, recordId, storageKey) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(81723642) IS NULL AS locked`;
  const activeJobs = { status: { in: ["queued", "processing"] } };
  const [globalCount, userCount] = await Promise.all([
    tx.recordOcrJob.count({ where: activeJobs }),
    tx.recordOcrJob.count({
      where: { ...activeJobs, record: { is: { userId } } },
    }),
  ]);
  if (globalCount >= MAX_GLOBAL_ACTIVE_OCR_JOBS || userCount >= MAX_USER_ACTIVE_OCR_JOBS) {
    const error = new Error("OCR queue is busy. Try again later.");
    error.statusCode = 429;
    throw error;
  }
  return tx.recordOcrJob.create({ data: { recordId, storageKey } });
}

async function getOcrStatus(prisma, userId, recordId) {
  const job = await prisma.$transaction(async (tx) => {
    const records = await tx.$queryRaw`
      SELECT "storage_key"
      FROM "medical_records"
      WHERE "id" = ${recordId}::uuid AND "user_id" = ${userId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    const storageKey = records[0]?.storage_key;
    if (!storageKey) throw httpError(404, "File not found");

    const existing = await tx.recordOcrJob.findUnique({
      where: { recordId_storageKey: { recordId, storageKey } },
    });
    if (existing) return existing;

    return enqueueOcrJob(tx, userId, recordId, storageKey);
  });
  return toDto(job);
}

module.exports = {
  MAX_GLOBAL_ACTIVE_OCR_JOBS,
  MAX_USER_ACTIVE_OCR_JOBS,
  getOcrStatus,
  toDto,
  enqueueOcrJob,
};
