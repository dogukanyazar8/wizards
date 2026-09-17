import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExplicitE2ETestMode } from "@/lib/e2e/mode";
import { shouldUseE2EVoiceMock } from "./voice-provider";

/**
 * Ekran paylaşımı Ş0.3 (T13): `chromium-real-media` projesi `NEXT_PUBLIC_E2E_VOICE_REAL_MEDIA=true`
 * ile koşar ve sahte sağlayıcı takılmaz. Bayrak yokken karar eski `isExplicitE2ETestMode`
 * kararının kendisidir — mevcut e2e davranışı değişmez.
 */
describe("voice provider real-media gate", () => {
  const e2eTestMode = {
    allowProductionBuild: undefined,
    nodeEnv: "test",
    testMode: "true",
  } as const;

  it("keeps the E2E mock when the real-media flag is absent", () => {
    assert.equal(shouldUseE2EVoiceMock({ ...e2eTestMode, realMedia: undefined }), true);
  });

  it("swaps in the live provider when the real-media flag is exactly true", () => {
    assert.equal(shouldUseE2EVoiceMock({ ...e2eTestMode, realMedia: "true" }), false);
  });

  it("treats any other flag value as off", () => {
    for (const realMedia of ["1", "TRUE", "yes", "false", ""]) {
      assert.equal(
        shouldUseE2EVoiceMock({ ...e2eTestMode, realMedia }),
        true,
        `realMedia=${JSON.stringify(realMedia)} must not disable the mock`,
      );
    }
  });

  it("matches isExplicitE2ETestMode exactly whenever the flag is off", () => {
    const cases = [
      { allowProductionBuild: undefined, nodeEnv: "development", testMode: "true" },
      { allowProductionBuild: undefined, nodeEnv: "production", testMode: "true" },
      { allowProductionBuild: "true", nodeEnv: "production", testMode: "true" },
      { allowProductionBuild: "true", nodeEnv: "production", testMode: undefined },
      { allowProductionBuild: undefined, nodeEnv: "test", testMode: "false" },
    ];

    for (const input of cases) {
      assert.equal(
        shouldUseE2EVoiceMock({ ...input, realMedia: undefined }),
        isExplicitE2ETestMode(input),
        `gate must equal isExplicitE2ETestMode for ${JSON.stringify(input)}`,
      );
    }
  });

  it("never mocks outside test mode, with or without the flag", () => {
    const production = {
      allowProductionBuild: undefined,
      nodeEnv: "production",
      testMode: undefined,
    };
    assert.equal(shouldUseE2EVoiceMock({ ...production, realMedia: undefined }), false);
    assert.equal(shouldUseE2EVoiceMock({ ...production, realMedia: "true" }), false);
  });
});
