import assert from "node:assert/strict";
import test from "node:test";
import { assertDisposableDatabaseUrl } from "./verify-prisma7-disposable.mjs";

test("accepts only a loopback PostgreSQL database ending in _prisma7_verify", () => {
  assert.equal(
    assertDisposableDatabaseUrl(
      "postgresql://wizards:wizards@127.0.0.1:5432/wizards_prisma7_verify",
    ).database,
    "wizards_prisma7_verify",
  );
  assert.throws(
    () => assertDisposableDatabaseUrl("postgresql://postgres.example/uat"),
    /loopback.*_prisma7_verify/i,
  );
  assert.throws(
    () => assertDisposableDatabaseUrl("postgresql://127.0.0.1:5432/wizards"),
    /loopback.*_prisma7_verify/i,
  );
});
