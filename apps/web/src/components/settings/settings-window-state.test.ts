import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSettingsWindowState,
  isSettingsDirtyKey,
  resolveSettingsNavigationMethod,
  resolveSettingsEscape,
  settingsWindowReducer,
  type SettingsWindowState,
} from "./settings-window-state";
import { SETTINGS_DIRTY_PROFILE_KEYS } from "@/lib/settings/metrics";
import { SETTINGS_TABS_BY_SECTION } from "@/lib/settings/navigation";

function stateWith(overrides: Partial<SettingsWindowState> = {}): SettingsWindowState {
  return { ...createSettingsWindowState(), ...overrides };
}

describe("ayarlar içi rota yöntemi", () => {
  it("modal geçmişini büyütmez; tam sayfa geri geçmişini korur", () => {
    assert.equal(resolveSettingsNavigationMethod("modal"), "replace");
    assert.equal(resolveSettingsNavigationMethod("page"), "push");
  });
});

describe("settingsWindowReducer", () => {
  it("starts on the default route with nothing open and nothing saved", () => {
    assert.deepEqual(createSettingsWindowState(), {
      dirty: false,
      openRisky: null,
      openSelect: null,
      query: "",
      save: "idle",
      section: "account",
      tab: "profile",
    });
  });

  it("moves the tab to the first tab of the section and closes both transient layers", () => {
    const next = settingsWindowReducer(
      stateWith({ openRisky: "twoFactor", openSelect: "nt3", section: "account", tab: "security" }),
      { section: "notifications", type: "selectSection" },
    );

    assert.equal(next.section, "notifications");
    assert.equal(next.tab, SETTINGS_TABS_BY_SECTION.notifications[0]);
    assert.equal(next.openSelect, null);
    assert.equal(next.openRisky, null);
  });

  it("closes both transient layers on a tab change", () => {
    const next = settingsWindowReducer(
      stateWith({ openRisky: "password", openSelect: "na6", tab: "profile" }),
      { tab: "security", type: "selectTab" },
    );

    assert.equal(next.tab, "security");
    assert.equal(next.openSelect, null);
    assert.equal(next.openRisky, null);
  });

  it("closes the transient layers when the address changes underneath it", () => {
    const next = settingsWindowReducer(
      stateWith({ openRisky: "deleteAccount", openSelect: "nt3" }),
      { section: "appearance", tab: "theme", type: "syncRoute" },
    );

    assert.equal(next.section, "appearance");
    assert.equal(next.tab, "theme");
    assert.equal(next.openSelect, null);
    assert.equal(next.openRisky, null);
  });

  it("keeps a single open menu and a single open risky block", () => {
    const opened = settingsWindowReducer(stateWith(), { key: "nt3", type: "toggleSelect" });
    assert.equal(opened.openSelect, "nt3");

    const swapped = settingsWindowReducer(opened, { key: "na6", type: "toggleSelect" });
    assert.equal(swapped.openSelect, "na6");

    const closed = settingsWindowReducer(swapped, { key: "na6", type: "toggleSelect" });
    assert.equal(closed.openSelect, null);

    const risky = settingsWindowReducer(stateWith({ openRisky: "password" }), {
      key: "twoFactor",
      type: "toggleRisky",
    });
    assert.equal(risky.openRisky, "twoFactor");
  });

  it("closes the open menu when a risky block opens", () => {
    const next = settingsWindowReducer(stateWith({ openSelect: "nt3" }), {
      key: "password",
      type: "toggleRisky",
    });

    assert.equal(next.openRisky, "password");
    assert.equal(next.openSelect, null);
  });

  it("closes the open menu when the search view takes over the content", () => {
    const next = settingsWindowReducer(stateWith({ openSelect: "nt3" }), {
      query: "sessiz",
      type: "search",
    });

    assert.equal(next.query, "sessiz");
    assert.equal(next.openSelect, null);
  });
});

describe("Esc ladder", () => {
  it("reports menu, then risky block, then the window itself", () => {
    assert.equal(
      resolveSettingsEscape(stateWith({ openRisky: "password", openSelect: "nt3" })),
      "select",
    );
    assert.equal(resolveSettingsEscape(stateWith({ openRisky: "password" })), "risky");
    assert.equal(resolveSettingsEscape(stateWith()), "window");
  });

  it("walks one rung per escape and leaves the last rung to the route", () => {
    const start = stateWith({ openRisky: "password", openSelect: "nt3" });

    const afterMenu = settingsWindowReducer(start, { type: "escape" });
    assert.equal(afterMenu.openSelect, null);
    assert.equal(afterMenu.openRisky, "password");

    const afterRisky = settingsWindowReducer(afterMenu, { type: "escape" });
    assert.equal(afterRisky.openRisky, null);

    // Üçüncü `Esc` pencereyi kapatır; pencere bir rotadır, indirgeyici durumu değişmez.
    assert.equal(settingsWindowReducer(afterRisky, { type: "escape" }), afterRisky);
  });
});

describe("dirty flag (SPEC_DEVIATIONS #5)", () => {
  it("marks dirty for each of the eight profile keys", () => {
    assert.equal(SETTINGS_DIRTY_PROFILE_KEYS.length, 8);

    for (const key of SETTINGS_DIRTY_PROFILE_KEYS) {
      assert.equal(isSettingsDirtyKey(key), true, `${key} must set the dirty flag`);
      assert.equal(settingsWindowReducer(stateWith(), { key, type: "touch" }).dirty, true);
    }
  });

  it("does not use the `p` prefix heuristic: audio processing rows stay clean", () => {
    for (const key of ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]) {
      assert.equal(isSettingsDirtyKey(key), false, `${key} is an audio row, not a profile field`);
      assert.equal(settingsWindowReducer(stateWith(), { key, type: "touch" }).dirty, false);
    }
  });

  it("clears the dirty flag on reset", () => {
    assert.equal(
      settingsWindowReducer(stateWith({ dirty: true }), { type: "resetDirty" }).dirty,
      false,
    );
  });
});

describe("save state", () => {
  it("carries the three reported states and never invents a fourth", () => {
    let state = stateWith();

    for (const save of ["saving", "saved", "error"] as const) {
      state = settingsWindowReducer(state, { save, type: "save" });
      assert.equal(state.save, save);
    }
  });

  it("returns the same object when nothing changes", () => {
    const state = stateWith({ save: "saved" });

    assert.equal(settingsWindowReducer(state, { save: "saved", type: "save" }), state);
  });
});
