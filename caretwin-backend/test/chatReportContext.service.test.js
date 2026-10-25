const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getRecentReportContext,
  isReportRelated,
  MAX_TEXT_PER_REPORT,
  MAX_CONTEXT_LENGTH,
} = require("../src/services/chatReportContext.service");

test("detects report questions and report follow-ups", () => {
  assert.equal(isReportRelated("Can you explain my latest report?"), true);
  assert.equal(isReportRelated("What do my blood test results mean?"), true);
  assert.equal(isReportRelated("What does this mean?"), false);
});

test("builds bounded context only from OCR for current attachments", async () => {
  const records = [
    {
      id: "record-1",
      title: "Blood panel",
      recordType: "lab_report",
      recordDate: new Date("2026-10-20T00:00:00.000Z"),
      createdAt: new Date("2026-10-20T00:00:00.000Z"),
      storageKey: "current-file",
    },
    {
      id: "record-2",
      title: "Old panel",
      recordType: "lab_report",
      recordDate: null,
      createdAt: new Date("2026-10-19T00:00:00.000Z"),
      storageKey: "second-file",
    },
  ];
  const prisma = {
    medicalRecord: {
      findMany: async (query) => {
        assert.equal(query.where.userId, "owner-id");
        assert.equal(query.take, 1);
        return records;
      },
    },
    recordOcrJob: {
      findMany: async (query) => {
        assert.equal(query.where.status, "succeeded");
        assert.equal(query.where.recordId, "record-1");
        assert.equal(query.where.storageKey, "current-file");
        return [
          { recordId: "record-1", storageKey: "stale-file", text: "Must not appear" },
          { recordId: "record-1", storageKey: "current-file", text: "Hemoglobin 13.1 g/dL" },
          { recordId: "record-2", storageKey: "second-file", text: "Creatinine 1.1 mg/dL" },
        ];
      },
    },
  };

  const context = await getRecentReportContext(prisma, "owner-id");
  assert.match(context, /Blood panel/);
  assert.match(context, /Hemoglobin 13\.1 g\/dL/);
  assert.doesNotMatch(context, /Old panel|Creatinine/);
  assert.doesNotMatch(context, /Must not appear/);
});

test("uses only the latest report and caps its OCR text size", async () => {
  const records = [
    {
      id: "latest-record",
      title: "Latest report",
      recordType: "lab_report",
      recordDate: new Date("2026-10-20T00:00:00.000Z"),
      createdAt: new Date("2026-10-20T00:00:00.000Z"),
      storageKey: "latest-file",
    },
    {
      id: "older-record",
      title: "Older report",
      recordType: "lab_report",
      recordDate: new Date("2026-10-19T00:00:00.000Z"),
      createdAt: new Date("2026-10-19T00:00:00.000Z"),
      storageKey: "older-file",
    },
  ];
  const prisma = {
    medicalRecord: {
      findMany: async (query) => {
        assert.equal(query.take, 1);
        return records;
      },
    },
    recordOcrJob: {
      findMany: async (query) => {
        assert.equal(query.where.recordId, "latest-record");
        assert.equal(query.where.storageKey, "latest-file");
        return [
          {
            recordId: "latest-record",
            storageKey: "latest-file",
            text: "x".repeat(MAX_TEXT_PER_REPORT + 100),
          },
          {
            recordId: "older-record",
            storageKey: "older-file",
            text: "This must not be included",
          },
        ];
      },
    },
  };

  const context = await getRecentReportContext(prisma, "owner-id");
  assert.equal((context.match(/Report: /g) ?? []).length, 1);
  assert.match(context, /Latest report/);
  assert.doesNotMatch(context, /Older report|This must not be included/);
  assert.ok(context.length <= MAX_CONTEXT_LENGTH);
  assert.match(context, /\[Report text truncated\]/);
});

test("does not substitute an older report when the latest report has no OCR", async () => {
  const prisma = {
    medicalRecord: {
      findMany: async () => [{
        id: "latest-record",
        title: "Latest report",
        recordType: "lab_report",
        recordDate: null,
        createdAt: new Date("2026-10-20T00:00:00.000Z"),
        storageKey: "latest-file",
      }],
    },
    recordOcrJob: { findMany: async () => [] },
  };

  assert.equal(await getRecentReportContext(prisma, "owner-id"), "");
});
