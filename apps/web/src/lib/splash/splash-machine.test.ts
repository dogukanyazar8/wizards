import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SPLASH_FADE_OUT_MS,
  SPLASH_MIN_VISIBLE_MS,
  SPLASH_REALTIME_GRACE_MS,
  SPLASH_SLOW_AFTER_MS,
} from "@wizards/types";

import {
  getNextSplashPhase,
  getNextSplashStep,
  getRemainingSplashVisibilityMs,
  getSplashActionKind,
  getSplashPhaseAfterFadeOut,
  getSplashState,
  getSplashStep,
  isSplashComplete,
  shouldMountSplash,
  shouldRetryAfterReconnect,
  shouldShowSplash,
  SPLASH_TIMINGS,
  type SplashRuntimeInput,
} from "./splash-machine";

function runtime(overrides: Partial<SplashRuntimeInput> = {}): SplashRuntimeInput {
  return {
    bootstrapRequestSettled: true,
    elapsedMs: 0,
    online: true,
    realtimeConnected: true,
    sessionExpired: false,
    sessionHydrated: true,
    update: null,
    workspaceLoaded: true,
    ...overrides,
  };
}

describe("getSplashStep", () => {
  it("walks the SPEC order as signals land", () => {
    assert.equal(getSplashStep(runtime({ bootstrapRequestSettled: false })), "connecting");
    assert.equal(getSplashStep(runtime({ sessionHydrated: false })), "session");
    assert.equal(getSplashStep(runtime({ workspaceLoaded: false })), "servers");
    assert.equal(getSplashStep(runtime({ realtimeConnected: false })), "almostReady");
    assert.equal(getSplashStep(runtime()), "almostReady");
  });

  it("reports the earliest unfinished phase, not the latest finished one", () => {
    const input = runtime({ bootstrapRequestSettled: false, workspaceLoaded: false });

    assert.equal(getSplashStep(input), "connecting");
  });
});

describe("getNextSplashStep", () => {
  it("never walks backwards when a signal flaps", () => {
    const flapped = runtime({ workspaceLoaded: false });

    assert.equal(getNextSplashStep("almostReady", flapped), "almostReady");
    assert.equal(getNextSplashStep("session", flapped), "servers");
  });
});

describe("getSplashState", () => {
  it("stays on the plain splash while everything is normal", () => {
    assert.equal(getSplashState(runtime()), "loading");
  });

  it("switches to slow after ten seconds", () => {
    assert.equal(getSplashState(runtime({ elapsedMs: SPLASH_SLOW_AFTER_MS - 1 })), "loading");
    assert.equal(getSplashState(runtime({ elapsedMs: SPLASH_SLOW_AFTER_MS })), "slow");
  });

  it("ranks an expired session above every other signal", () => {
    const input = runtime({
      elapsedMs: SPLASH_SLOW_AFTER_MS,
      online: false,
      sessionExpired: true,
      update: { downloadedBytes: 1, totalBytes: 2, version: "2.5.0" },
    });

    assert.equal(getSplashState(input), "sessionExpired");
  });

  it("ranks a running download above an offline network", () => {
    const input = runtime({
      online: false,
      update: { downloadedBytes: 1, totalBytes: 2, version: "2.5.0" },
    });

    assert.equal(getSplashState(input), "updating");
  });

  it("ranks an offline network above the slow timer", () => {
    const input = runtime({ elapsedMs: SPLASH_SLOW_AFTER_MS, online: false });

    assert.equal(getSplashState(input), "offline");
  });

  it("keeps the update state on surfaces that report no total size", () => {
    const input = runtime({ update: { downloadedBytes: 0, totalBytes: null, version: "2.5.0" } });

    assert.equal(getSplashState(input), "updating");
  });
});

describe("isSplashComplete", () => {
  it("waits for all four phases, realtime included", () => {
    assert.equal(isSplashComplete(runtime()), true);

    for (const missing of [
      { bootstrapRequestSettled: false },
      { sessionHydrated: false },
      { workspaceLoaded: false },
      { realtimeConnected: false },
    ]) {
      assert.equal(isSplashComplete(runtime(missing)), false, JSON.stringify(missing));
    }
  });

  it("stops waiting for the socket after the grace window", () => {
    const withoutSocket = { elapsedMs: SPLASH_REALTIME_GRACE_MS, realtimeConnected: false };

    assert.equal(
      isSplashComplete(runtime({ ...withoutSocket, elapsedMs: SPLASH_REALTIME_GRACE_MS - 1 })),
      false,
    );
    assert.equal(isSplashComplete(runtime(withoutSocket)), true);
  });

  it("never forgives the other three phases, however long it waits", () => {
    for (const missing of [
      { bootstrapRequestSettled: false },
      { sessionHydrated: false },
      { workspaceLoaded: false },
    ]) {
      assert.equal(
        isSplashComplete(runtime({ ...missing, elapsedMs: 10 * SPLASH_REALTIME_GRACE_MS })),
        false,
        JSON.stringify(missing),
      );
    }
  });
});

describe("splash phase", () => {
  it("holds the splash for the minimum visible window", () => {
    assert.equal(getRemainingSplashVisibilityMs(0), SPLASH_MIN_VISIBLE_MS);
    assert.equal(getRemainingSplashVisibilityMs(SPLASH_MIN_VISIBLE_MS + 40), 0);

    assert.equal(
      getNextSplashPhase({ isComplete: true, phase: "showing", shownForMs: 120 }),
      "showing",
    );
    assert.equal(
      getNextSplashPhase({ isComplete: true, phase: "showing", shownForMs: SPLASH_MIN_VISIBLE_MS }),
      "hiding",
    );
  });

  it("stays visible while the shell is not ready", () => {
    assert.equal(
      getNextSplashPhase({ isComplete: false, phase: "showing", shownForMs: 60_000 }),
      "showing",
    );
  });

  it("only leaves hiding after the fade", () => {
    assert.equal(
      getNextSplashPhase({ isComplete: true, phase: "hiding", shownForMs: 10_000 }),
      "hiding",
    );
    assert.equal(getSplashPhaseAfterFadeOut("hiding"), "dismissed");
    assert.equal(getSplashPhaseAfterFadeOut("showing"), "showing");
  });

  it("mounts through the fade and paints only while showing", () => {
    assert.equal(shouldMountSplash("showing"), true);
    assert.equal(shouldMountSplash("hiding"), true);
    assert.equal(shouldMountSplash("dismissed"), false);

    assert.equal(shouldShowSplash("showing"), true);
    assert.equal(shouldShowSplash("hiding"), false);
  });
});

describe("getSplashActionKind", () => {
  it("çevrimdışıyken sayfayı yenilemez, yalnız yeniden dener", () => {
    // `location.reload()` çevrimdışıyken tarayıcının hata sayfasını açar ve
    // kullanıcı uygulamayı tümüyle kaybeder.
    assert.equal(getSplashActionKind("offline"), "retry");
  });

  it("kalan durumlarda sayfayı yeniler", () => {
    assert.equal(getSplashActionKind("slow"), "reload");
    assert.equal(getSplashActionKind("sessionExpired"), "reload");
    assert.equal(getSplashActionKind("updating"), "reload");
    assert.equal(getSplashActionKind("loading"), "reload");
  });
});

describe("shouldRetryAfterReconnect", () => {
  it("retries by itself once the network returns", () => {
    assert.equal(shouldRetryAfterReconnect("offline", runtime()), true);
  });

  it("does not retry from other states or while still offline", () => {
    assert.equal(shouldRetryAfterReconnect("offline", runtime({ online: false })), false);
    assert.equal(shouldRetryAfterReconnect("loading", runtime()), false);
    assert.equal(shouldRetryAfterReconnect("offline", runtime({ sessionExpired: true })), false);
  });
});

describe("SPLASH_TIMINGS", () => {
  it("re-exports the shared contract, not local copies", () => {
    assert.deepEqual(SPLASH_TIMINGS, {
      fadeOutMs: SPLASH_FADE_OUT_MS,
      minVisibleMs: SPLASH_MIN_VISIBLE_MS,
      realtimeGraceMs: SPLASH_REALTIME_GRACE_MS,
      slowAfterMs: SPLASH_SLOW_AFTER_MS,
    });
    // Soket tavanı, `Uzun sürüyor` durumundan sonra gelmeli: kullanıcı önce
    // durumu görür, sonra uygulama canlı bağlantı olmadan açılır.
    assert.ok(SPLASH_REALTIME_GRACE_MS > SPLASH_SLOW_AFTER_MS);
  });
});
