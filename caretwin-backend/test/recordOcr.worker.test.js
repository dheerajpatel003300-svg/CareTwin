const test = require("node:test");
const assert = require("node:assert/strict");
const { startRecordOcrWorker } = require("../src/services/recordOcr.worker");

test("OCR worker completes jobs using an injected local engine", async () => {
  const job = {
    id: "job-id",
    storageKey: "owner-id/0123456789abcdef0123456789abcdef.png",
  };
  let claimed = false;
  let completed = null;
  const prisma = {
    recordOcrJob: {
      updateMany: async ({ where, data }) => {
        if (where.id === job.id) completed = data;
        return { count: 1 };
      },
    },
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => {
          if (claimed) return [];
          claimed = true;
          return [{ id: job.id }];
        },
        recordOcrJob: {
          update: async ({ data }) => ({ ...job, ...data }),
        },
      }),
  };
  const logs = [];
  const logger = {
    info: (...args) => logs.push(args),
    error: (...args) => logs.push(args),
  };
  const engine = {
    probeRuntime: async () => {},
    processDocument: async (storageKey) => {
      assert.equal(storageKey, job.storageKey);
      return {
        text: "Extracted safely",
        confidence: 91,
        needsReview: false,
        flags: [],
        quality: "high",
      };
    },
  };
  const stop = await startRecordOcrWorker({ prisma, logger, engine });

  for (let i = 0; i < 50 && !completed; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await stop();

  assert.equal(completed.status, "succeeded");
  assert.equal(completed.text, "Extracted safely");
  assert.equal(completed.confidence, 91);
  assert.equal(logs.some((entry) => JSON.stringify(entry).includes("Extracted safely")), false);
});

test("OCR worker stores a safe failure code without logging extracted content", async () => {
  const job = {
    id: "job-id",
    storageKey: "owner-id/0123456789abcdef0123456789abcdef.png",
  };
  let claimed = false;
  let failureUpdate = null;
  const prisma = {
    recordOcrJob: {
      updateMany: async ({ where, data }) => {
        if (where.id === job.id) failureUpdate = data;
        return { count: 1 };
      },
    },
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => {
          if (claimed) return [];
          claimed = true;
          return [{ id: job.id }];
        },
        recordOcrJob: {
          update: async ({ data }) => ({ ...job, ...data }),
        },
      }),
  };
  const logs = [];
  const logger = {
    info: (...args) => logs.push(args),
    error: (...args) => logs.push(args),
  };
  const engine = {
    probeRuntime: async () => {},
    processDocument: async () => {
      const error = new Error("sensitive text must not appear in stored error state");
      error.code = "OCR_TIMEOUT";
      throw error;
    },
  };
  const stop = await startRecordOcrWorker({ prisma, logger, engine });

  for (let i = 0; i < 50 && !failureUpdate; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await stop();

  assert.equal(failureUpdate.status, "failed");
  assert.equal(failureUpdate.errorCode, "OCR_TIMEOUT");
  assert.equal(failureUpdate.text, null);
  assert.equal(JSON.stringify(logs).includes("sensitive text"), false);
});
