const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRecordSchema,
  updateRecordSchema,
  isRecordDateNotFuture,
} = require("../src/validators/record.validator");

const INDIA_TIME_ZONE_OFFSET_MINUTES = -330;
const UTC_BEFORE_LOCAL_MIDNIGHT = Date.UTC(2026, 9, 22, 19, 30);

test("date-only records accept the current date in the user's timezone", () => {
  const localToday = new Date(
    Date.now() - INDIA_TIME_ZONE_OFFSET_MINUTES * 60_000,
  ).toISOString().slice(0, 10);
  const result = createRecordSchema.safeParse({
    title: "Lab report",
    recordType: "lab_report",
    recordDate: localToday,
    timeZoneOffsetMinutes: INDIA_TIME_ZONE_OFFSET_MINUTES,
  });

  assert.equal(result.success, true);
  assert.equal("timeZoneOffsetMinutes" in result.data, false);
  assert.equal(result.data.recordDate.toISOString(), `${localToday}T00:00:00.000Z`);
});

test("date-only records reject dates after the user's current date", () => {
  const tomorrow = new Date("2026-10-24T00:00:00.000Z");
  assert.equal(
    isRecordDateNotFuture(tomorrow, INDIA_TIME_ZONE_OFFSET_MINUTES, UTC_BEFORE_LOCAL_MIDNIGHT),
    false,
  );
});

test("record updates accept the current date in the user's timezone", () => {
  const localToday = new Date(
    Date.now() - INDIA_TIME_ZONE_OFFSET_MINUTES * 60_000,
  ).toISOString().slice(0, 10);
  const result = updateRecordSchema.safeParse({
    recordDate: localToday,
    timeZoneOffsetMinutes: INDIA_TIME_ZONE_OFFSET_MINUTES,
  });

  assert.equal(result.success, true);
  assert.equal("timeZoneOffsetMinutes" in result.data, false);
});
