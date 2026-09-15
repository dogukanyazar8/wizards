import assert from "node:assert/strict";
import { it } from "node:test";
import {
  appearancePatchToSettings,
  resetAppearanceLayout,
  mainPanelWidthToPercent,
  mainPanelPercentToWidth,
} from "./appearance-runtime";
import { SettingsValueStore } from "./use-setting-value";
import { normalizeStoredServerRailWidth } from "@/lib/appearance";

it("legacy expanded rail widths retain the previous 74 px appearance", () => {
  for (const width of [136, 184]) assert.equal(normalizeStoredServerRailWidth(width), 74);
  for (const width of [60, 74, 92]) assert.equal(normalizeStoredServerRailWidth(width), width);
});

it("persists every layout dimension including icon size without clipping valid choices", () => {
  for (const [y1, y2, y3, y4] of [
    [60, 36, 200, 70],
    [74, 44, 252, 85],
    [92, 56, 300, 100],
  ]) {
    assert.deepEqual(appearancePatchToSettings({ y1: y1!, y2: y2!, y3: y3!, y4: y4!, y5: false }), {
      serverRailWidth: y1,
      serverIconSize: y2,
      channelSidebarWidth: y3,
      mainContentWidth: y4,
      showMemberPanelByDefault: false,
    });
    assert.equal(mainPanelWidthToPercent(mainPanelPercentToWidth(y4!)), y4);
  }
});

it("reset updates controls immediately and sends one complete layout patch", async () => {
  const writes: unknown[] = [];
  const store = new SettingsValueStore({
    values: { y1: 90, y2: 56, y3: 300, y4: 70, y5: false },
    write: async (patch) => {
      writes.push(appearancePatchToSettings(patch));
    },
  });
  resetAppearanceLayout(store);
  assert.equal(store.getValue("y3"), 252);
  assert.equal(writes.length, 0);
  await store.flushPending();
  assert.deepEqual(writes, [
    {
      serverRailWidth: 74,
      serverIconSize: 44,
      channelSidebarWidth: 252,
      mainContentWidth: 100,
      showMemberPanelByDefault: true,
    },
  ]);
  store.dispose();
});

it("media and accessibility changes roll back together when saving fails", async () => {
  const values = {
    v1: true,
    v2: true,
    v3: true,
    v4: true,
    x2: false,
    x3: true,
    x4: 100,
    reduceMotion: false,
  };
  const store = new SettingsValueStore({
    values,
    write: async () => {
      throw new Error("offline");
    },
  });
  const observed: unknown[] = [];
  store.subscribe(() => {
    const snapshot = Object.fromEntries(
      Object.keys(values).map((key) => [key, store.getValue(key)!]),
    );
    observed.push(appearancePatchToSettings(snapshot));
  });
  for (const [key, value] of Object.entries(values))
    store.setValue(key, typeof value === "boolean" ? !value : 130);
  assert.equal((observed.at(-1) as { highContrast: boolean }).highContrast, true);
  await assert.rejects(store.flushPending(), /SETTINGS_WRITE_FAILED/);
  assert.deepEqual(observed.at(-1), appearancePatchToSettings(values));
  store.dispose();
});
