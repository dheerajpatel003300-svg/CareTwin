const test = require("node:test");
const assert = require("node:assert/strict");
const { registerSchema } = require("../src/validators/auth.validator");

const validRegistration = {
  firstName: "Dheeraj",
  lastName: "Patel",
  email: "dheeraj@example.com",
  password: "SecurePass123",
  dateOfBirth: "1990-04-16",
  gender: "male",
};

test("registration requires a valid date of birth and gender", () => {
  assert.equal(registerSchema.safeParse(validRegistration).success, true);
  assert.equal(
    registerSchema.safeParse({
      firstName: "Dheeraj",
      lastName: "Patel",
      email: "dheeraj@example.com",
      password: "SecurePass123",
    }).success,
    false,
  );
});

test("registration rejects invalid or future dates of birth", () => {
  assert.equal(registerSchema.safeParse({ ...validRegistration, dateOfBirth: "1990-02-30" }).success, false);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.equal(registerSchema.safeParse({ ...validRegistration, dateOfBirth: tomorrow }).success, false);
});
