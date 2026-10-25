const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createFamilyMemberRouter } = require("../src/routes/familyMember.routes");
const { createRecordRouter } = require("../src/routes/record.routes");
const { signAccessToken } = require("../src/utils/jwt");

process.env.JWT_ACCESS_SECRET = "test-secret-that-is-long-enough";

const OWNER_ID = "8a0c2b91-3544-4c9e-bf81-206532d178a1";
const MEMBER_ID = "dbd617a7-3435-4d1b-bdb0-fc25bf7f0c9d";
const RECORD_ID = "18a6e5ae-2ea8-49a9-9f39-e9c4bfe2c88e";
const now = new Date("2026-10-07T00:00:00.000Z");

function createApi() {
  const member = {
    id: MEMBER_ID,
    name: "Alex Doe",
    relationship: "child",
    dateOfBirth: new Date("2015-01-02T00:00:00.000Z"),
    gender: "other",
    isSelf: false,
    createdAt: now,
    updatedAt: now,
  };
  const job = {
    status: "succeeded",
    text: "Hemoglobin result",
    confidence: 92.4,
    needsReview: false,
    flags: [],
    quality: "high",
    updatedAt: now,
  };
  const prisma = {
    familyMember: {
      findMany: async ({ where }) => {
        assert.equal(where.userId, OWNER_ID);
        return [member];
      },
    },
    recordOcrJob: {
      findUnique: async () => job,
    },
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => [{ storage_key: `${OWNER_ID}/0123456789abcdef0123456789abcdef.pdf` }],
        recordOcrJob: { findUnique: async () => job },
      }),
    auditLog: { create: async () => ({}) },
  };

  const app = express();
  app.use(express.json());
  app.use("/family-members", createFamilyMemberRouter({ prisma }));
  app.use("/records", createRecordRouter({ prisma, redis: { call: async () => "OK" } }));
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({
      success: false,
      error: { message: err.message, details: err.details },
    });
  });
  return app;
}

test("authenticated family listing and OCR result expose the agreed API envelopes", async (t) => {
  const app = createApi();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${signAccessToken(OWNER_ID)}` };

  const familyResponse = await fetch(`${base}/family-members`, { headers });
  assert.equal(familyResponse.status, 200);
  const familyBody = await familyResponse.json();
  assert.deepEqual(Object.keys(familyBody.data), ["familyMembers"]);
  assert.deepEqual(familyBody.data.familyMembers[0], {
    id: MEMBER_ID,
    name: "Alex Doe",
    relationship: "child",
    dateOfBirth: "2015-01-02",
    gender: "other",
    isSelf: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const ocrResponse = await fetch(`${base}/records/${RECORD_ID}/ocr`, { headers });
  assert.equal(ocrResponse.status, 200);
  assert.equal(ocrResponse.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await ocrResponse.json(), {
    success: true,
    data: {
      status: "succeeded",
      text: "Hemoglobin result",
      confidence: 92.4,
      needsReview: false,
      flags: [],
      quality: "high",
      updatedAt: now.toISOString(),
    },
  });
});

test("family routes require authentication", async (t) => {
  const app = createApi();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/family-members`);
  assert.equal(response.status, 401);
});
