const test = require("node:test");
const assert = require("node:assert/strict");
const storage = require("../src/services/storage.service");
const { attachFile } = require("../src/services/recordFile.service");

const OLD_KEY = "owner-id/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf";
const NEW_KEY = "owner-id/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf";

function mockStorage(t) {
  const removed = [];
  const saved = [];
  const original = {
    newKey: storage.newKey,
    saveFile: storage.saveFile,
    deleteFile: storage.deleteFile,
  };
  storage.newKey = () => NEW_KEY;
  storage.saveFile = async (key, buffer) => saved.push({ key, buffer });
  storage.deleteFile = async (key) => removed.push(key);
  t.after(() => {
    storage.newKey = original.newKey;
    storage.saveFile = original.saveFile;
    storage.deleteFile = original.deleteFile;
  });
  return { removed, saved };
}

function createPrisma({ queuedCount = 0, oldStorageKey = OLD_KEY } = {}) {
  const createdJobs = [];
  const prisma = {
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => [{ storage_key: oldStorageKey }],
        medicalRecord: { update: async () => ({}) },
        recordOcrJob: {
          deleteMany: async () => ({ count: 0 }),
          count: async () => queuedCount,
          create: async ({ data }) => {
            createdJobs.push(data);
            return data;
          },
        },
      }),
  };
  return { prisma, createdJobs };
}

test("file upload queues OCR and replaces the previous attachment", async (t) => {
  const files = mockStorage(t);
  const { prisma, createdJobs } = createPrisma();
  const result = await attachFile(prisma, "owner-id", "record-id", {
    buffer: Buffer.from("%PDF-1.7 document"),
    originalname: "lab.pdf",
  });

  assert.deepEqual(result, { mime: "application/pdf", ocr: { status: "queued" } });
  assert.deepEqual(files.saved.map(({ key }) => key), [NEW_KEY]);
  assert.deepEqual(files.removed, [OLD_KEY]);
  assert.deepEqual(createdJobs, [{ recordId: "record-id", storageKey: NEW_KEY }]);
});

test("queue saturation rejects upload and removes the newly stored file", async (t) => {
  const files = mockStorage(t);
  const { prisma, createdJobs } = createPrisma({ queuedCount: 50 });

  await assert.rejects(
    attachFile(prisma, "owner-id", "record-id", {
      buffer: Buffer.from("%PDF-1.7 document"),
      originalname: "lab.pdf",
    }),
    { statusCode: 429, message: "OCR queue is busy. Try again later." }
  );
  assert.deepEqual(files.removed, [NEW_KEY]);
  assert.deepEqual(createdJobs, []);
});
