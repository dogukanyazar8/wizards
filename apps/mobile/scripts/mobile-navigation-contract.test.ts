import assert from "node:assert/strict";
import test from "node:test";
import {
  createMobileNavigationState,
  DEFAULT_MOBILE_TAB_ID,
  getMobileTabForRoutePath,
  isMobileTabId,
  MOBILE_BOTTOM_TAB_IDS,
  MOBILE_TAB_IDS,
  mobileNavigationReducer,
  parseMobileChannelsRoutePath,
  resolveMobileRoute,
} from "../src/navigation/mobile-navigation";

test("mobile tab ids are stable and validate unknown input", () => {
  assert.deepEqual(MOBILE_TAB_IDS, [
    "overview",
    "messages",
    "notifications",
    "voice",
    "settings",
  ]);
  assert.deepEqual(MOBILE_BOTTOM_TAB_IDS, [
    "overview",
    "messages",
    "notifications",
    "voice",
    "settings",
  ]);
  assert.equal(isMobileTabId("messages"), true);
  assert.equal(isMobileTabId("members"), false);
});

test("bottom navigation exposes only primary native product surfaces", () => {
  const bottomTabs = MOBILE_BOTTOM_TAB_IDS as readonly string[];
  assert.equal(bottomTabs.includes("messages"), true);
  assert.equal(bottomTabs.includes("notifications"), true);
  assert.equal(bottomTabs.includes("overview"), true);
  assert.equal(bottomTabs.includes("settings"), true);
  assert.equal(bottomTabs.includes("voice"), true);
  assert.equal(MOBILE_TAB_IDS.includes("voice"), true);
});

test("mobile navigation state falls back to the home overview tab", () => {
  assert.deepEqual(createMobileNavigationState("not-a-tab"), {
    currentTab: DEFAULT_MOBILE_TAB_ID,
    previousTab: null,
  });
});

test("mobile navigation reducer ignores unknown tabs", () => {
  const state = createMobileNavigationState("overview");
  assert.equal(mobileNavigationReducer(state, { tab: "unknown", type: "select" }), state);
});

test("mobile navigation reducer tracks the previous tab", () => {
  const state = createMobileNavigationState("overview");
  const next = mobileNavigationReducer(state, { tab: "messages", type: "select" });

  assert.deepEqual(next, {
    currentTab: "messages",
    previousTab: "overview",
  });
});

test("protected mobile routes are gated while signed out", () => {
  assert.deepEqual(resolveMobileRoute("messages", "signed-out"), {
    blockedReason: "auth-required",
    currentTab: "messages",
    isBlocked: true,
    requiresSession: true,
  });
});

test("server overview is gated while signed out", () => {
  assert.deepEqual(resolveMobileRoute("overview", "signed-out"), {
    blockedReason: "auth-required",
    currentTab: "overview",
    isBlocked: true,
    requiresSession: true,
  });
});

test("notifications are gated while signed out", () => {
  assert.deepEqual(resolveMobileRoute("notifications", "signed-out"), {
    blockedReason: "auth-required",
    currentTab: "notifications",
    isBlocked: true,
    requiresSession: true,
  });
});

test("protected mobile routes can distinguish loading from signed-out", () => {
  assert.equal(resolveMobileRoute("voice", "checking").blockedReason, "checking");
  assert.equal(resolveMobileRoute("voice", "signed-in").isBlocked, false);
});

test("public mobile routes stay available without a session", () => {
  assert.deepEqual(resolveMobileRoute("settings", "signed-out"), {
    blockedReason: null,
    currentTab: "settings",
    isBlocked: false,
    requiresSession: false,
  });
});

test("mobile channel route parsing is bounded and decode-safe", () => {
  assert.deepEqual(parseMobileChannelsRoutePath("/channels/@me"), {
    channelId: null,
    serverId: "@me",
  });
  assert.deepEqual(parseMobileChannelsRoutePath("/channels/server%201/channel%202?x=1"), {
    channelId: "channel 2",
    serverId: "server 1",
  });
  assert.equal(parseMobileChannelsRoutePath("/settings"), null);
});

test("mobile route paths resolve to the intended native product surface", () => {
  assert.equal(getMobileTabForRoutePath("/channels/@me"), "messages");
  assert.equal(getMobileTabForRoutePath("/channels/server-1/channel-1"), "overview");
  assert.equal(getMobileTabForRoutePath("/settings/profile"), "settings");
  assert.equal(getMobileTabForRoutePath("/invite/invite-code"), "overview");
  assert.equal(getMobileTabForRoutePath("/unknown"), DEFAULT_MOBILE_TAB_ID);
});
