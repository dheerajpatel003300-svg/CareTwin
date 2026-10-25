const test = require("node:test");
const assert = require("node:assert/strict");
const recordService = require("../src/services/record.service");

test("record creation rejects a family member owned by another account", async () => {
  const prisma = {
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => [],
        medicalRecord: { create: async () => assert.fail("foreign member must not be attached") },
      }),
  };
  await assert.rejects(
    recordService.createRecord(prisma, "owner-id", {
      title: "Report",
      recordType: "lab_report",
      familyMemberId: "foreign-member-id",
    }),
    { statusCode: 404, message: "Family member not found" }
  );
});

test("record creation rejects accounts missing the migrated self member", async () => {
  const prisma = {
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => [],
        medicalRecord: { create: async () => assert.fail("record must not be created without self") },
      }),
  };
  await assert.rejects(
    recordService.createRecord(prisma, "owner-id", {
      title: "Report",
      recordType: "lab_report",
    }),
    { message: "Default self family member is missing" }
  );
});
