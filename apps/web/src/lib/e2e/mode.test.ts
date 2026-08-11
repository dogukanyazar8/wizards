import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isExplicitE2ETestMode } from "./mode";

describe("explicit E2E test mode", () => {
  it("allows local development when test mode is explicit", () => {
    assert.equal(
      isExplicitE2ETestMode({
        allowProductionBuild: undefined,
        nodeEnv: "development",
        testMode: "true",
      }),
      true,
    );
  });

  it("allows a production build only with the separate production-build opt-in", () => {
    assert.equal(
      isExplicitE2ETestMode({
        allowProductionBuild: undefined,
        nodeEnv: "production",
        testMode: "true",
      }),
      false,
    );
    assert.equal(
      isExplicitE2ETestMode({
        allowProductionBuild: "true",
        nodeEnv: "production",
        testMode: "true",
      }),
      true,
    );
  });

  it("never enables E2E behavior without the test-mode opt-in", () => {
    assert.equal(
      isExplicitE2ETestMode({
        allowProductionBuild: "true",
        nodeEnv: "production",
        testMode: undefined,
      }),
      false,
    );
  });
});
