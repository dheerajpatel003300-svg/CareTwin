const test = require("node:test");
const assert = require("node:assert/strict");
const familyMemberService = require("../src/services/familyMember.service");
const { createFamilyMemberSchema } = require("../src/validators/familyMember.validator");

test("family-member DOB rejects calendar dates that JavaScript would roll forward", () => {
  const result = createFamilyMemberSchema.safeParse({
    name: "Alex",
    relationship: "child",
    dateOfBirth: "2015-02-31",
  });
  assert.equal(result.success, false);
});

test("family-member lookup hides foreign IDs", async () => {
  const prisma = {
    familyMember: { findFirst: async () => null },
  };
  await assert.rejects(
    familyMemberService.getFamilyMember(prisma, "owner-id", "foreign-id"),
    { statusCode: 404, message: "Family member not found" }
  );
});

test("self family member cannot be deleted", async () => {
  const prisma = {
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => [{ id: "self-id", is_self: true }],
        medicalRecord: { count: async () => 0 },
        familyMember: { update: async () => assert.fail("self member must not be deleted") },
      }),
  };
  await assert.rejects(
    familyMemberService.deleteFamilyMember(prisma, "owner-id", "self-id"),
    { statusCode: 409, message: "The self family member cannot be deleted" }
  );
});

test("family member with active records cannot be deleted", async () => {
  const prisma = {
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => [{ id: "member-id", is_self: false }],
        medicalRecord: { count: async () => 1 },
        familyMember: { update: async () => assert.fail("member with records must not be deleted") },
      }),
  };
  await assert.rejects(
    familyMemberService.deleteFamilyMember(prisma, "owner-id", "member-id"),
    { statusCode: 409 }
  );
});

test("family-member cap is enforced", async () => {
  const prisma = {
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => [{ id: "owner-id" }],
        familyMember: {
          count: async () => familyMemberService.MAX_ACTIVE_FAMILY_MEMBERS,
          create: async () => assert.fail("member must not be created over the cap"),
        },
      }),
  };
  await assert.rejects(
    familyMemberService.createFamilyMember(prisma, "owner-id", {
      name: "Another member",
      relationship: "relative",
    }),
    { statusCode: 409 }
  );
});
