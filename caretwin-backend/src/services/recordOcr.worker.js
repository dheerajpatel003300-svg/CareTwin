const ocrEngine = require("./recordOcr.engine");

const POLL_INTERVAL_MS = 1_000;
const STALE_JOB_MS = 5 * 60 * 1000;
const SAFE_ERROR_CODES = new Set([
  "OCR_TIMEOUT",
  "OCR_OUTPUT_LIMIT",
  "OCR_RUNTIME_MISSING",
  "OCR_PROCESS_FAILED",
  "OCR_INVALID_IMAGE",
  "OCR_IMAGE_LIMIT",
  "OCR_INVALID_PDF",
  "OCR_PAGE_LIMIT",
  "OCR_PAGE_DIMENSION_LIMIT",
  "OCR_NO_TEXT",
  "OCR_UNSUPPORTED_FILE",
]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function claimNextJob(prisma) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT "id"
      FROM "record_ocr_jobs"
      WHERE "status" = 'queued'
      ORDER BY "created_at" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (!rows.length) return null;

    return tx.recordOcrJob.update({
      where: { id: rows[0].id },
      data: {
        status: "processing",
        startedAt: new Date(),
        finishedAt: null,
        attempts: { increment: 1 },
        errorCode: null,
      },
    });
  });
}

async function markStaleJobsQueued(prisma) {
  await prisma.recordOcrJob.updateMany({
    where: { status: "processing", updatedAt: { lt: new Date(Date.now() - STALE_JOB_MS) } },
    data: { status: "queued", startedAt: null },
  });
}

async function completeJob(prisma, job, result) {
  await prisma.recordOcrJob.updateMany({
    where: {
      id: job.id,
      status: "processing",
      storageKey: job.storageKey,
      record: { is: { storageKey: job.storageKey, deletedAt: null } },
    },
    data: {
      status: "succeeded",
      text: result.text,
      confidence: result.confidence,
      needsReview: result.needsReview,
      flags: result.flags,
      quality: result.quality,
      errorCode: null,
      finishedAt: new Date(),
    },
  });
}

async function failJob(prisma, job, error) {
  const errorCode = SAFE_ERROR_CODES.has(error.code) ? error.code : "OCR_FAILED";
  await prisma.recordOcrJob.updateMany({
    where: {
      id: job.id,
      status: "processing",
      storageKey: job.storageKey,
      record: { is: { storageKey: job.storageKey, deletedAt: null } },
    },
    data: {
      status: "failed",
      text: null,
      confidence: null,
      needsReview: null,
      flags: null,
      quality: null,
      errorCode,
      finishedAt: new Date(),
    },
  });
  return errorCode;
}

async function startRecordOcrWorker({ prisma, logger, engine = ocrEngine }) {
  await engine.probeRuntime();
  await markStaleJobsQueued(prisma);
  let stopping = false;
  let activeJob = null;

  const loop = async () => {
    while (!stopping) {
      try {
        activeJob = await claimNextJob(prisma);
        if (!activeJob) {
          await delay(POLL_INTERVAL_MS);
          continue;
        }
        try {
          const result = await engine.processDocument(activeJob.storageKey);
          await completeJob(prisma, activeJob, result);
        } catch (error) {
          const errorCode = await failJob(prisma, activeJob, error);
          logger.error({ jobId: activeJob.id, errorCode }, "record OCR job failed");
        } finally {
          activeJob = null;
        }
      } catch (error) {
        logger.error(
          { errorCode: error.code || error.name || "WORKER_ERROR" },
          "record OCR worker iteration failed"
        );
        await delay(POLL_INTERVAL_MS);
      }
    }
  };

  const loopPromise = loop();
  logger.info("local record OCR worker started");
  return async function stop() {
    stopping = true;
    await loopPromise;
    logger.info("local record OCR worker stopped");
  };
}

module.exports = {
  POLL_INTERVAL_MS,
  STALE_JOB_MS,
  claimNextJob,
  markStaleJobsQueued,
  startRecordOcrWorker,
};
