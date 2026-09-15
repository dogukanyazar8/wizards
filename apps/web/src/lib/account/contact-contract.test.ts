import assert from "node:assert/strict";
import { it } from "node:test";
import { PhoneNumberSchema, EmailChangeRequestSchema } from "./contact-contract";

it("normalizes international phone formatting without guessing a country", () => {
  assert.equal(PhoneNumberSchema.parse("+90 (532) 123-42-18"), "+905321234218");
  assert.equal(PhoneNumberSchema.parse(""), null);
  for (const value of ["05321234218", "+0123456789", "+90532abc123", "+1234567890123456"]) {
    assert.equal(PhoneNumberSchema.safeParse(value).success, false, value);
  }
});
it("normalizes the new email, bounds credentials, rejects extra fields", () => {
  assert.equal(
    EmailChangeRequestSchema.parse({ email: " NEW@Example.com ", password: "secret" }).email,
    "new@example.com",
  );
  assert.equal(
    EmailChangeRequestSchema.safeParse({ email: "x@y.com", userId: "other" }).success,
    false,
  );
  assert.equal(
    EmailChangeRequestSchema.safeParse({ email: "x@y.com", password: "x".repeat(101) }).success,
    false,
  );
});
