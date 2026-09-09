import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SPLASH_TEXT_KEYS as IndexedTextKeys } from "./index";
import { assertAccepts, assertRejects, assertSchemaBehaviorCoverage } from "./schema-test-helpers";
import * as splash from "./splash";
import {
  advanceSplashStep,
  formatSplashUpdateProgress,
  formatSplashVersionLine,
  getSplashStepStatus,
  pickSplashTipKey,
  resolveSplashEnvironment,
  SPLASH_FADE_OUT_MS,
  SPLASH_MIN_VISIBLE_MS,
  SPLASH_REALTIME_GRACE_MS,
  SPLASH_SLOW_AFTER_MS,
  SPLASH_STEP_ORDER,
  SPLASH_TEXT_KEYS,
  SPLASH_TIP_TEXT_KEYS,
  SplashEnvironmentSchema,
  SplashStateIdSchema,
  SplashStepIdSchema,
  SplashStepStatusSchema,
  SplashSurfaceSchema,
  SplashUpdateProgressSchema,
  SplashVersionInfoSchema,
} from "./splash";

describe("splash schemas", () => {
  it("covers every exported schema", () => {
    assertSchemaBehaviorCoverage(splash, {
      SplashEnvironmentSchema: { invalid: "beta", schema: SplashEnvironmentSchema, valid: "uat" },
      SplashStateIdSchema: { invalid: "ready", schema: SplashStateIdSchema, valid: "offline" },
      SplashStepIdSchema: { invalid: "realtime", schema: SplashStepIdSchema, valid: "connecting" },
      SplashStepStatusSchema: {
        invalid: "active",
        schema: SplashStepStatusSchema,
        valid: "current",
      },
      SplashSurfaceSchema: { invalid: "tv", schema: SplashSurfaceSchema, valid: "desktop" },
      SplashUpdateProgressSchema: {
        invalid: { downloadedBytes: -1, totalBytes: 10 },
        schema: SplashUpdateProgressSchema,
        valid: { downloadedBytes: 11_800_000, totalBytes: 18_400_000, version: "2.5.0" },
      },
      SplashVersionInfoSchema: {
        invalid: { buildNumber: "1187", codename: "Resonance", version: "" },
        schema: SplashVersionInfoSchema,
        valid: { buildNumber: "1187", codename: "Resonance", version: "2.4.1" },
      },
    });
  });

  it("accepts an unknown total download size but not a zero one", () => {
    assertAccepts(SplashUpdateProgressSchema, {
      downloadedBytes: 0,
      totalBytes: null,
      version: "2.5.0",
    });
    assertRejects(
      SplashUpdateProgressSchema,
      { downloadedBytes: 0, totalBytes: 0, version: "2.5.0" },
      ["totalBytes"],
    );
  });

  it("keeps the version parts optional", () => {
    assertAccepts(SplashVersionInfoSchema, { version: "0.8.15" });
    assertRejects(SplashVersionInfoSchema, { extra: true, version: "0.8.15" });
  });
});

describe("resolveSplashEnvironment", () => {
  it("treats only production and stable as PROD", () => {
    for (const channel of ["production", "stable", "PRODUCTION", " Stable "]) {
      assert.equal(resolveSplashEnvironment(channel), "prod", channel);
    }
  });

  it("falls back to UAT for every other channel", () => {
    for (const channel of ["uat", "development", "beta", "canary", "", "  ", "banana"]) {
      assert.equal(resolveSplashEnvironment(channel), "uat", channel);
    }

    assert.equal(resolveSplashEnvironment(null), "uat");
    assert.equal(resolveSplashEnvironment(undefined), "uat");
  });
});

describe("formatSplashVersionLine", () => {
  it("renders the SPEC line for both environments", () => {
    assert.equal(
      formatSplashVersionLine({ buildNumber: "1187", codename: "Resonance", version: "2.4.1" }),
      "Whispr 2.4.1 (1187) · Resonance",
    );
    assert.equal(
      formatSplashVersionLine({
        buildNumber: "1204",
        codename: "Resonance",
        version: "2.5.0-rc3",
      }),
      "Whispr 2.5.0-rc3 (1204) · Resonance",
    );
  });

  it("drops the whole block when a part is missing", () => {
    assert.equal(
      formatSplashVersionLine({ codename: "Echo", version: "0.8.15" }),
      "Whispr 0.8.15 · Echo",
    );
    assert.equal(
      formatSplashVersionLine({ buildNumber: "1204", version: "0.8.15" }),
      "Whispr 0.8.15 (1204)",
    );
    assert.equal(formatSplashVersionLine({ version: "0.8.15" }), "Whispr 0.8.15");
  });

  it("normalizes decorated version strings", () => {
    assert.equal(formatSplashVersionLine({ version: "v2.4.1" }), "Whispr 2.4.1");
    assert.equal(
      formatSplashVersionLine({ codename: "Echo", version: '0.8.15 "Echo"' }),
      "Whispr 0.8.15 · Echo",
    );
  });
});

describe("splash steps", () => {
  it("marks earlier steps done and later steps pending", () => {
    assert.equal(getSplashStepStatus("connecting", "servers"), "done");
    assert.equal(getSplashStepStatus("servers", "servers"), "current");
    assert.equal(getSplashStepStatus("almostReady", "servers"), "pending");
  });

  it("never walks backwards", () => {
    assert.equal(advanceSplashStep("servers", "connecting"), "servers");
    assert.equal(advanceSplashStep("servers", "servers"), "servers");
    assert.equal(advanceSplashStep("servers", "almostReady"), "almostReady");
  });

  it("keeps the SPEC order", () => {
    assert.deepEqual(SPLASH_STEP_ORDER, ["connecting", "session", "servers", "almostReady"]);
  });
});

describe("formatSplashUpdateProgress", () => {
  it("renders the SPEC frame", () => {
    assert.equal(
      formatSplashUpdateProgress({
        downloadedBytes: 11_800_000,
        totalBytes: 18_400_000,
        version: "2.5.0",
      }),
      "%64 · 11,8 / 18,4 MB",
    );
  });

  it("returns null when the total is unknown", () => {
    assert.equal(
      formatSplashUpdateProgress({ downloadedBytes: 5, totalBytes: null, version: "2.5.0" }),
      null,
    );
  });

  it("clamps an over-reported download to 100%", () => {
    assert.equal(
      formatSplashUpdateProgress({
        downloadedBytes: 20_000_000,
        totalBytes: 18_400_000,
        version: "2.5.0",
      }),
      "%100 · 18,4 / 18,4 MB",
    );
  });
});

describe("splash text keys", () => {
  it("is exported from the package index", () => {
    assert.equal(IndexedTextKeys, SPLASH_TEXT_KEYS);
  });

  it("has no duplicates", () => {
    assert.equal(new Set(SPLASH_TEXT_KEYS).size, SPLASH_TEXT_KEYS.length);
  });

  it("covers four steps, four tips, two environments and four states", () => {
    // 2 (kicker + tagline) + 4 adım + 2 ortam + 4 ipucu + 16 durum metni
    assert.equal(SPLASH_TEXT_KEYS.length, 28);
  });
});

describe("pickSplashTipKey", () => {
  it("spans every tip", () => {
    const picked = new Set([0, 0.3, 0.6, 0.9].map(pickSplashTipKey));
    assert.equal(picked.size, SPLASH_TIP_TEXT_KEYS.length);
  });

  it("survives out-of-range randomness", () => {
    assert.equal(pickSplashTipKey(1), SPLASH_TIP_TEXT_KEYS[SPLASH_TIP_TEXT_KEYS.length - 1]);
    assert.equal(pickSplashTipKey(-1), SPLASH_TIP_TEXT_KEYS[0]);
    assert.equal(pickSplashTipKey(Number.NaN), SPLASH_TIP_TEXT_KEYS[0]);
  });
});

describe("splash timings", () => {
  it("matches SPEC §8", () => {
    assert.equal(SPLASH_MIN_VISIBLE_MS, 600);
    assert.equal(SPLASH_FADE_OUT_MS, 180);
    assert.equal(SPLASH_SLOW_AFTER_MS, 10_000);
    // SPEC'te yok: soketi süresiz beklememek için konan tavan (kullanıcı kararı).
    assert.equal(SPLASH_REALTIME_GRACE_MS, 20_000);
    assert.ok(SPLASH_REALTIME_GRACE_MS > SPLASH_SLOW_AFTER_MS);
  });
});
