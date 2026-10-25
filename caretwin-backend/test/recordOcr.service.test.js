const test = require("node:test");
const assert = require("node:assert/strict");
const recordOcrService = require("../src/services/recordOcr.service");

test("OCR status lookup does not disclose a record outside the owner", async () => {
  const prisma = {
    $transaction: async (callback) => callback({ $queryRaw: async () => [] }),
  };
  await assert.rejects(recordOcrService.getOcrStatus(prisma, "owner-id", "foreign-record-id"), {
    statusCode: 404,
    message: "File not found",
  });
});

test("OCR DTO exposes text only for successful jobs", () => {
  const updatedAt = new Date("2026-10-07T00:00:00.000Z");
  assert.deepEqual(
    recordOcrService.toDto({
      status: "processing",
      text: "must not leak",
      errorCode: null,
      updatedAt,
    }),
    { status: "processing", updatedAt: "2026-10-07T00:00:00.000Z" }
  );
  assert.deepEqual(
    recordOcrService.toDto({
      status: "failed",
      text: "must not leak",
      errorCode: "OCR_TIMEOUT",
      updatedAt,
    }),
    { status: "failed", error: "OCR_TIMEOUT", updatedAt: "2026-10-07T00:00:00.000Z" }
  );
});

test("OCR queue lock query returns a Prisma-supported value", async () => {
  let lockQuery = "";
  let createdJob;
  const tx = {
    $queryRaw: async (strings) => {
      lockQuery = strings.join("?");
      return [{ locked: true }];
    },
    recordOcrJob: {
      count: async () => 0,
      create: async ({ data }) => {
        createdJob = data;
        return data;
      },
    },
  };

  const result = await recordOcrService.enqueueOcrJob(
    tx,
    "user-id",
    "record-id",
    "owner/file.pdf",
  );

  assert.match(lockQuery, /pg_advisory_xact_lock\(81723642\) IS NULL AS locked/);
  assert.deepEqual(result, { recordId: "record-id", storageKey: "owner/file.pdf" });
  assert.deepEqual(createdJob, result);
});
