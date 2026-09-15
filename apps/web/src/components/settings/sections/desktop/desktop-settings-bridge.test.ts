import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fromOverlayAnchor,
  fromOverlaySize,
  fromReleaseChannel,
  fromRichPresenceAudience,
  toDesktopSettingsValues,
  toOverlayAnchor,
  toOverlaySize,
  toReleaseChannel,
  toRichPresenceAudience,
} from "./desktop-settings-bridge";
import { deriveDesktopTab } from "./desktop-tab-defs";
import { findSettingsTab } from "@/lib/settings/tree";

/** Ş10 — satır anahtarları ↔ gerçek köprü. */

describe("segment eşlemeleri", () => {
  it("`w7` görünürlüğü `privacy.ts` sözleşmesini konuşur", () => {
    assert.equal(toRichPresenceAudience(0), "friends");
    assert.equal(toRichPresenceAudience(1), "nobody");
    assert.equal(fromRichPresenceAudience("nobody"), 1);
    assert.equal(fromRichPresenceAudience("friends"), 0);
  });

  it("`z3` konumu dört köşeyi gidip gelir", () => {
    for (const index of [0, 1, 2, 3]) {
      assert.equal(fromOverlayAnchor(toOverlayAnchor(index)), index);
    }
  });

  it("`z4` boyutu üç adımı gidip gelir", () => {
    for (const index of [0, 1, 2]) {
      assert.equal(fromOverlaySize(toOverlaySize(index)), index);
    }
  });

  it("tanınmayan değer varsayılana düşer, çökmez", () => {
    assert.equal(toOverlayAnchor(99), "top-left");
    assert.equal(toOverlaySize("nope"), "normal");
    assert.equal(toReleaseChannel(null), "stable");
  });
});

describe("release kanalı", () => {
  it("kolonun `UAT` değeri tasarımın `Beta` çipine düşer", () => {
    assert.equal(fromReleaseChannel("UAT"), 1);
    assert.equal(toReleaseChannel(1), "beta");
  });

  it("kolon boşken `Kararlı` seçili gelir", () => {
    assert.equal(fromReleaseChannel(null), 0);
  });

  it("beta iki yönde de korunur", () => {
    assert.equal(fromReleaseChannel("BETA"), 1);
    assert.equal(toReleaseChannel(1), "beta");
  });
});

describe("toDesktopSettingsValues", () => {
  const state = {
    gameOverlayAnchor: "bottom-right" as const,
    gameOverlayEnabled: true,
    gameOverlayProcessDetection: false,
    gameOverlaySize: "large" as const,
    preferredReleaseChannel: "BETA",
    richPresence: false,
    richPresenceAudience: "nobody" as const,
    shortcutsEnabled: true,
    streamerMode: true,
    streamerModeDetection: true,
    updaterAutoCheck: false,
    voiceMiniEnabled: true,
    gameOverlaySpeakingOnly: false,
  };

  it("on üç satır anahtarı doldurulur", () => {
    const values = toDesktopSettingsValues(state);

    assert.equal(Object.keys(values).length, 13);
  });

  it("anahtarlar ağacın satır anahtarlarıdır", () => {
    const values = toDesktopSettingsValues(state);

    assert.equal("w1" in values, false);
    assert.equal("w2" in values, false);
    assert.equal(values.w7, 1);
    assert.equal(values.z3, 3);
    assert.equal(values.z4, 2);
    assert.equal(values.h2, 1);
    assert.equal(values.q1, true);
    assert.equal(values.z5, false);
    assert.equal(toDesktopSettingsValues({ ...state, gameOverlaySpeakingOnly: true }).z5, true);
    assert.equal(toDesktopSettingsValues({ ...state, voiceMiniEnabled: false }).z5, false);
  });
});

describe("overlay settings ownership", () => {
  it("keeps speaking-only in the game group and leaves Voice Mini independent", () => {
    const tab = findSettingsTab("desktop", "overlay");
    assert.ok(tab);
    assert.deepEqual(
      tab.groups[0]?.rows.map((row) => row.key),
      ["z1"],
    );
    assert.ok(tab.groups[1]?.rows.some((row) => row.key === "z5"));
  });
});

describe("deriveDesktopTab — pil türevi", () => {
  it("yalnız etkinleştirme ve tekil atama kontrollerini taşır", () => {
    const tab = findSettingsTab("desktop", "shortcuts");
    assert.ok(tab);
    const derived = deriveDesktopTab(tab, { upToDate: true });
    assert.deepEqual(
      derived.groups.flatMap((group) => group.rows.map((row) => row.key)),
      ["q1", "q2"],
    );
  });

  it("güncelleme varken `h1` `Güncel` demez", () => {
    const tab = findSettingsTab("updates", "updates");
    assert.ok(tab);

    const derived = deriveDesktopTab(tab, { upToDate: false });
    const row = derived.groups[0]?.rows.find((entry) => entry.key === "h1");

    assert.equal(row?.badgeKey, undefined);
  });

  it("türev satır sayısını ve sırasını değiştirmez", () => {
    for (const key of ["app", "shortcuts", "overlay", "permissions", "updates"] as const) {
      const tab = findSettingsTab(key === "updates" ? "updates" : "desktop", key);
      assert.ok(tab);

      const derived = deriveDesktopTab(tab, { upToDate: false });

      assert.deepEqual(
        derived.groups.map((group) => group.rows.map((row) => row.key)),
        tab.groups.map((group) => group.rows.map((row) => row.key)),
      );
    }
  });
});
