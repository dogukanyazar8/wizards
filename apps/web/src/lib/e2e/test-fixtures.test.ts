import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveE2EUserPassword } from "./test-fixtures";

describe("E2E test fixtures", () => {
  it("requires an explicit password when E2E mode is enabled", () => {
    assert.throws(
      () => resolveE2EUserPassword({ E2E_TEST_MODE: "true" }),
      /E2E_TEST_PASSWORD is required/,
    );
  });

  it("rejects short E2E passwords", () => {
    assert.throws(
      () =>
        resolveE2EUserPassword({
          E2E_TEST_MODE: "true",
          E2E_TEST_PASSWORD: "short",
        }),
      /at least 8 characters/,
    );
  });

  it("returns the explicit E2E password without a fallback", () => {
    assert.equal(
      resolveE2EUserPassword({
        E2E_TEST_MODE: "true",
        E2E_TEST_PASSWORD: "local-e2e-password",
      }),
      "local-e2e-password",
    );
  });
});
