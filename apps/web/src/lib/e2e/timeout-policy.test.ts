import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveE2ETimeoutPolicy } from "./timeout-policy";

test("keeps CI screen tests within the composed authentication and readiness budget", () => {
  assert.deepEqual(resolveE2ETimeoutPolicy({ CI: "true" }), {
    authRequestTimeoutMs: 30_000,
    screenTestTimeoutMs: 75_000,
  });
});

test("keeps the local feedback loop shorter without weakening the CI policy", () => {
  assert.deepEqual(resolveE2ETimeoutPolicy({}), {
    authRequestTimeoutMs: 15_000,
    screenTestTimeoutMs: 45_000,
  });
});
