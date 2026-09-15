import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getThemeSessionSyncDecision } from "./theme-session-sync";

describe("theme session sync decisions", () => {
  it("applies the preferred session theme on the first sync", () => {
    const decision = getThemeSessionSyncDecision({
      currentTheme: "theme-light",
      preferredTheme: "theme-dark",
    });

    assert.equal(decision.nextLastPreferredTheme, "theme-dark");
    assert.equal(decision.themeToApply, "theme-dark");
  });

  it("does not re-apply a stale preferred theme after a local theme change", () => {
    const decision = getThemeSessionSyncDecision({
      currentTheme: "theme-lavender",
      lastPreferredTheme: "theme-light",
      preferredTheme: "theme-light",
    });

    assert.equal(decision.nextLastPreferredTheme, "theme-light");
    assert.equal(decision.themeToApply, null);
  });

  it("syncs again when the preferred session theme genuinely changes", () => {
    const decision = getThemeSessionSyncDecision({
      currentTheme: "theme-light",
      lastPreferredTheme: "theme-light",
      preferredTheme: "theme-onyx",
    });

    assert.equal(decision.nextLastPreferredTheme, "theme-onyx");
    assert.equal(decision.themeToApply, "theme-onyx");
  });

  it("keeps the latest local selection when an earlier save refreshes the session", () => {
    const decision = getThemeSessionSyncDecision({
      currentTheme: "theme-onyx",
      lastPreferredTheme: "theme-light",
      preferredTheme: "theme-lavender",
    });
    assert.equal(decision.themeToApply, null);
    assert.equal(decision.nextLastPreferredTheme, "theme-lavender");
  });

  it("does not force a fallback when the session has no preferred theme", () => {
    const decision = getThemeSessionSyncDecision({
      currentTheme: "theme-lavender",
      preferredTheme: null,
    });

    assert.equal(decision.nextLastPreferredTheme, null);
    assert.equal(decision.themeToApply, null);
  });

  it("accepts the first preference when a session becomes available", () => {
    assert.equal(
      getThemeSessionSyncDecision({
        currentTheme: "theme-light",
        lastPreferredTheme: null,
        preferredTheme: "theme-dark",
      }).themeToApply,
      "theme-dark",
    );
  });
});
