import assert from "node:assert/strict";
import test from "node:test";
import {
  createMobileNavigationState,
  DEFAULT_MOBILE_TAB_ID,
  isMobileTabId,
  MOBILE_TAB_IDS,
  mobileNavigationReducer,
  resolveMobileRoute,
} from "../src/navigation/mobile-navigation";

test("mobile tab ids are stable and validate unknown input", () => {
  assert.deepEqual(MOBILE_TAB_IDS, ["messages", "overview", "voice", "settings"]);
  assert.equal(isMobileTabId("messages"), true);
  assert.equal(isMobileTabId("members"), false);
});

test("mobile navigation state falls back to the messages tab", () => {
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
