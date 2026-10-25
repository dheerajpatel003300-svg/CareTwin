const test = require("node:test");
const assert = require("node:assert/strict");
const { mortalityRiskSchema } = require("../src/validators/prediction.validator");

test("mortality prediction accepts a report date without an admission time", () => {
  const result = mortalityRiskSchema.safeParse({
    age: 35,
    admissionDate: "2026-10-23",
    labs: {},
  });
  assert.equal(result.success, true);
});

test("mortality prediction still accepts a full admission timestamp", () => {
  const result = mortalityRiskSchema.safeParse({
    age: 35,
    admissionTime: "2026-10-23T11:30:00",
    labs: {},
  });
  assert.equal(result.success, true);
});

test("mortality prediction requires either a report date or admission timestamp", () => {
  const result = mortalityRiskSchema.safeParse({ age: 35, labs: {} });
  assert.equal(result.success, false);
});
