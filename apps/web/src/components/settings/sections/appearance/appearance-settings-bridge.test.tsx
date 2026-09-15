import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { SETTINGS_TEST_LAYOUT } from "@/lib/settings/read-test-fixtures";
import { settingsQueryKeys } from "@/lib/settings/client";
import { SettingsValueStore } from "@/lib/settings/use-setting-value";

import {
  APPEARANCE_SERVER_ROWS,
  applyAppearanceDocumentEffects,
  FOCUS_RINGS_ATTRIBUTE,
  HIGH_CONTRAST_ATTRIBUTE,
  mainPanelPercentToWidth,
  mainPanelWidthToPercent,
  readAppearanceSettingsValues,
  readAppearanceServerValues,
  REDUCE_MOTION_ATTRIBUTE,
  type AppearanceDocumentRoot,
  subscribeAppearanceStoreToQuery,
} from "@/components/settings/sections/appearance/appearance-settings-bridge";

it("updates the shared query immediately and rolls back a failed save without a mounted tab", async () => {
  const client = new QueryClient();
  client.setQueryData(settingsQueryKeys.layout, SETTINGS_TEST_LAYOUT);
  const store = new SettingsValueStore({
    values: readAppearanceServerValues(SETTINGS_TEST_LAYOUT),
    write: async () => {
      throw new Error("offline");
    },
  });
  const stop = subscribeAppearanceStoreToQuery(store, client);
  store.setValue("v1", false);
  store.setValue("y2", 56);
  store.setValue("x2", true);
  assert.equal(
    client.getQueryData<UserLayoutSettings>(settingsQueryKeys.layout)?.inlineAttachmentMedia,
    false,
  );
  assert.equal(
    client.getQueryData<UserLayoutSettings>(settingsQueryKeys.layout)?.serverIconSize,
    56,
  );
  assert.equal(
    client.getQueryData<UserLayoutSettings>(settingsQueryKeys.layout)?.highContrast,
    true,
  );
  await assert.rejects(store.flushPending());
  assert.equal(
    client.getQueryData<UserLayoutSettings>(settingsQueryKeys.layout)?.inlineAttachmentMedia,
    SETTINGS_TEST_LAYOUT.inlineAttachmentMedia,
  );
  assert.equal(
    client.getQueryData<UserLayoutSettings>(settingsQueryKeys.layout)?.serverIconSize,
    SETTINGS_TEST_LAYOUT.serverIconSize,
  );
  assert.equal(
    client.getQueryData<UserLayoutSettings>(settingsQueryKeys.layout)?.highContrast,
    SETTINGS_TEST_LAYOUT.highContrast,
  );
  stop();
  store.dispose();
  client.clear();
});
import { MAX_MAIN_PANEL_WIDTH, MIN_MAIN_PANEL_WIDTH } from "@/lib/appearance";
import { UI_SCALE_STEPS } from "@/lib/home/scale";
import { MESSAGE_FONT_OPTIONS } from "@/lib/message-fonts";
import { TEXT_SCALE_ATTRIBUTE } from "@/lib/settings/text-scale";
import { resolveSettingStateKey } from "@/lib/settings/use-setting-value";
import { ACCOUNT_PREFERENCES_DEFAULT } from "@wizards/types";
import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";

it("restores all four text controls from persisted settings when reopening appearance", () => {
  const settings: UserLayoutSettings = {
    ...ACCOUNT_PREFERENCES_DEFAULT,
    allowGroupInvites: true,
    channelSidebarWidth: 288,
    dmPolicy: "FRIENDS",
    friendRequestPolicy: "EVERYONE",
    idleTimeoutMinutes: 15,
    interfaceDensity: "COMPACT",
    messageFont: "inter",
    messageSizePx: 20,
    messageDisplayCompact: true,
    animateEmoji: true,
    animateStickers: "INTERACTION",
    appIcon: "whispr",
    enableTTS: true,
    followSystemA11y: true,
    highContrast: false,
    inlineAttachmentMedia: true,
    linkPreviews: true,
    mainContentWidth: 100,
    reduceMotion: false,
    renderEmbeds: true,
    renderReactions: true,
    screenReaderDescriptions: true,
    serverIconSize: 44,
    showMemberPanelByDefault: true,
    strongFocusRings: true,
    uiTextScale: 100,
    notificationAutoClose: true,
    notificationLimit: 5,
    serverRailWidth: 136,
    desktopNotifications: true,
    mobileNotifications: true,
    emailNotifications: false,
    notificationSound: true,
    notificationSoundFile: "default",
  };
  const values = readAppearanceServerValues(settings);
  assert.equal(
    values.m1,
    MESSAGE_FONT_OPTIONS.findIndex((font) => font.id === "inter"),
  );
  assert.equal(values.m2, 20);
  assert.equal(values.m3, 1);
  assert.equal(values.m4, true);
});

/** Ş8 §B — görünüm satırlarının üç hedefi ve belge etkileri. */

function createRoot() {
  const store = new Map<string, string>();
  const style = { fontSize: "" };

  const root: AppearanceDocumentRoot = {
    getAttribute: (name) => store.get(name) ?? null,
    setAttribute: (name, value) => {
      store.set(name, value);
    },
    style: {
      get fontSize() {
        return style.fontSize;
      },
      set fontSize(value: string) {
        style.fontSize = value;
      },
    },
  };

  return { root, store };
}

describe("Görünüm köprüsü — hedefler", () => {
  it("F2 — sunucuya giden eşleme `PatchSettingsSchema` ile birebir", () => {
    assert.deepEqual(APPEARANCE_SERVER_ROWS, {
      m1: "messageFont",
      m2: "messageSizePx",
      m3: "interfaceDensity",
      m4: "messageDisplayCompact",
      reduceMotion: "reduceMotion",
      v1: "inlineAttachmentMedia",
      v2: "linkPreviews",
      v3: "renderEmbeds",
      v4: "renderReactions",
      x2: "highContrast",
      x3: "strongFocusRings",
      x4: "uiTextScale",
      y1: "serverRailWidth",
      y2: "serverIconSize",
      y3: "channelSidebarWidth",
      y4: "mainContentWidth",
      y5: "showMemberPanelByDefault",
    });
  });

  it("F2 — kalıcılık şemasındaki Görünüm satırları sunucu alanına gidiyor", () => {
    // Consumer'ı olmayanlar UI'da kapalıdır; bu liste yalnız persistence sözleşmesini ölçer.
    assert.equal(Object.keys(APPEARANCE_SERVER_ROWS).length, 17);

    for (const row of ["m2", "m4", "v1", "v4", "x2", "x4", "y4", "y5"]) {
      assert.ok(row in APPEARANCE_SERVER_ROWS, `${row} sunucu alanı yok`);
    }
  });

  it("uygulama kutusundan satır değerleri", () => {
    const values = readAppearanceSettingsValues({
      channelSidebarWidth: 244,
      mainPanelWidth: MIN_MAIN_PANEL_WIDTH,
      memberPanelCollapsed: true,
      messageFont: "inter",
      serverRailIconSize: 40,
      serverRailWidth: 136,
    });

    assert.equal(
      values.m1,
      MESSAGE_FONT_OPTIONS.findIndex((option) => option.id === "inter"),
    );
    assert.equal(values.y3, 244);
    assert.equal(values.y4, 70);
    assert.equal(values.y5, false, "`y5` panel açık mı sorusudur, kapalı mı değil");
  });

  it("`y4` yüzde ↔ piksel dönüşümü tek yerde ve tersine dönüyor", () => {
    assert.equal(mainPanelPercentToWidth(70), MIN_MAIN_PANEL_WIDTH);
    assert.equal(mainPanelPercentToWidth(100), MAX_MAIN_PANEL_WIDTH);
    assert.equal(mainPanelWidthToPercent(MIN_MAIN_PANEL_WIDTH), 70);
    assert.equal(mainPanelWidthToPercent(MAX_MAIN_PANEL_WIDTH), 100);

    for (const percent of [70, 80, 90, 100]) {
      assert.equal(mainPanelWidthToPercent(mainPanelPercentToWidth(percent)), percent);
    }
  });
});

describe("Görünüm köprüsü — belge etkileri", () => {
  it("`x4` ölçek adımının üstüne biniyor", () => {
    const { root, store } = createRoot();
    const step = UI_SCALE_STEPS[2]!;

    applyAppearanceDocumentEffects({ x4: 120 }, root, step.rootFontSizePx);

    assert.equal(store.get(TEXT_SCALE_ATTRIBUTE), "120");
    assert.equal(root.style.fontSize, "28.8px");
  });

  it("hareket, kontrast ve odak nitelikleri köke yazılıyor", () => {
    const { root, store } = createRoot();

    applyAppearanceDocumentEffects({ reduceMotion: true, x2: true, x3: false }, root, 16);

    assert.equal(store.get(REDUCE_MOTION_ATTRIBUTE), "true");
    assert.equal(store.get(HIGH_CONTRAST_ATTRIBUTE), "true");
    assert.equal(store.get(FOCUS_RINGS_ATTRIBUTE), "false");
  });
});

it("reduce motion has one control and removed aliases are no longer mapped", () => {
  assert.equal(resolveSettingStateKey("v7"), "reduceMotion");
  for (const key of ["v5", "v6", "v8", "x1", "x5", "x6", "x7"]) {
    assert.equal(resolveSettingStateKey(key), key);
    assert.equal(key in APPEARANCE_SERVER_ROWS, false);
  }
});
