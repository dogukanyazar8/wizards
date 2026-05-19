import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getShellReadinessStatus,
  getShellSplashPhaseAfterMaxTimeout,
  isShellReady,
  SHELL_SPLASH_DELAY_MS,
  SHELL_SPLASH_FADE_OUT_MS,
  SHELL_SPLASH_MAX_VISIBLE_MS,
  SHELL_SPLASH_MIN_VISIBLE_MS,
  shouldMountShellSplash,
  shouldShowShellSplash,
  type ShellReadinessInput,
} from "./readiness";

const readyInput: ShellReadinessInput = {
  activeServerDetailLoading: false,
  appearanceHydrated: true,
  dmConversationsLoading: false,
  layoutSettingsLoaded: true,
  realtimeConnected: true,
  route: "other",
  serversLoading: false,
};

describe("app startup readiness", () => {
  it("requires appearance, layout settings, and workspace servers before marking the shell ready", () => {
    assert.equal(isShellReady({ ...readyInput, appearanceHydrated: false }), false);
    assert.equal(isShellReady({ ...readyInput, layoutSettingsLoaded: false }), false);
    assert.equal(isShellReady({ ...readyInput, serversLoading: true }), false);
    assert.equal(isShellReady(readyInput), true);
  });

  it("blocks server routes on active server detail only when the current route needs it", () => {
    assert.equal(
      isShellReady({
        ...readyInput,
        activeServerDetailLoading: true,
        route: "server-channel",
      }),
      false,
    );
    assert.equal(
      isShellReady({
        ...readyInput,
        activeServerDetailLoading: true,
        route: "server-root",
      }),
      false,
    );
    assert.equal(
      isShellReady({
        ...readyInput,
        activeServerDetailLoading: true,
        route: "other",
      }),
      true,
    );
  });

  it("blocks DM routes on the conversation list without blocking unrelated routes", () => {
    assert.equal(
      isShellReady({
        ...readyInput,
        dmConversationsLoading: true,
        route: "dm-list",
      }),
      false,
    );
    assert.equal(
      isShellReady({
        ...readyInput,
        dmConversationsLoading: true,
        route: "dm-conversation",
      }),
      false,
    );
    assert.equal(
      isShellReady({
        ...readyInput,
        dmConversationsLoading: true,
        route: "server-channel",
      }),
      true,
    );
  });

  it("does not use the global startup splash as a settings loading gate", () => {
    assert.equal(
      isShellReady({
        ...readyInput,
        activeServerDetailLoading: true,
        dmConversationsLoading: true,
        route: "settings",
      }),
      true,
    );
  });

  it("treats realtime as non-blocking readiness while still exposing a realtime status", () => {
    const input = { ...readyInput, realtimeConnected: false };

    assert.equal(isShellReady(input), true);
    assert.equal(getShellReadinessStatus(input), "realtime");
  });

  it("maps readiness states to safe startup status labels", () => {
    assert.equal(getShellReadinessStatus({ ...readyInput, appearanceHydrated: false }), "session");
    assert.equal(getShellReadinessStatus({ ...readyInput, layoutSettingsLoaded: false }), "session");
    assert.equal(getShellReadinessStatus({ ...readyInput, serversLoading: true }), "workspace");
    assert.equal(
      getShellReadinessStatus({
        ...readyInput,
        activeServerDetailLoading: true,
        route: "server-channel",
      }),
      "workspace",
    );
    assert.equal(
      getShellReadinessStatus({
        ...readyInput,
        dmConversationsLoading: true,
        route: "dm-list",
      }),
      "workspace",
    );
    assert.equal(getShellReadinessStatus(readyInput), "ready");
  });

  it("keeps splash timing constants aligned with the anti-flicker policy", () => {
    assert.equal(SHELL_SPLASH_DELAY_MS, 120);
    assert.equal(SHELL_SPLASH_MIN_VISIBLE_MS, 400);
    assert.equal(SHELL_SPLASH_MAX_VISIBLE_MS, 5000);
    assert.equal(SHELL_SPLASH_FADE_OUT_MS, 260);
  });

  it("mounts and shows the splash only for visible phases", () => {
    assert.equal(shouldMountShellSplash("pending"), false);
    assert.equal(shouldMountShellSplash("showing"), true);
    assert.equal(shouldMountShellSplash("hiding"), true);
    assert.equal(shouldMountShellSplash("dismissed"), false);

    assert.equal(shouldShowShellSplash("showing"), true);
    assert.equal(shouldShowShellSplash("hiding"), false);
  });

  it("falls back to the shell instead of keeping the splash forever after max timeout", () => {
    assert.equal(getShellSplashPhaseAfterMaxTimeout("pending"), "dismissed");
    assert.equal(getShellSplashPhaseAfterMaxTimeout("showing"), "hiding");
    assert.equal(getShellSplashPhaseAfterMaxTimeout("hiding"), "hiding");
    assert.equal(getShellSplashPhaseAfterMaxTimeout("dismissed"), "dismissed");
  });
});
