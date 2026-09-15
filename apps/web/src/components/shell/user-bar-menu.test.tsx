import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  VoiceStateContext,
  type VoiceStateContextValue,
} from "@/components/providers/voice-context";
import { UserBarMenu, isSettingsShortcut } from "@/components/shell/user-bar-menu";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";

/** Ş12 — 308 px kullanıcı barı menüsü. */

const TR = getMessagesForLocale("tr");
const NOOP = () => {};

const VOICE_STATE = {
  audioPreferences: { inputDeviceId: "default", outputDeviceId: "default" },
  setAudioPreference: NOOP,
} as unknown as VoiceStateContextValue;

function render(props: Partial<React.ComponentProps<typeof UserBarMenu>> = {}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider initialLocale="tr" initialMessages={TR}>
        <VoiceStateContext.Provider value={VOICE_STATE}>
          <UserBarMenu
            dndActive={false}
            dndDuration={null}
            onLogout={NOOP}
            onOpenSettings={NOOP}
            onSelectDndDuration={NOOP}
            onToggleDnd={NOOP}
            {...props}
          />
        </VoiceStateContext.Provider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("UserBarMenu — sıra ve içerik", () => {
  const markup = render();

  it("menü sırası: DND → cihazlar → Ayarlar → Çıkış", () => {
    const order = [
      'data-testid="user-menu-dnd"',
      'data-testid="user-menu-device-input"',
      'data-testid="user-menu-device-output"',
      'data-testid="user-appearance-settings-button"',
      'data-testid="user-logout-button"',
    ].map((needle) => markup.indexOf(needle));

    assert.ok(
      order.every((index) => index >= 0),
      "dört satırın hepsi çizilmeli",
    );
    assert.deepEqual(
      order,
      [...order].sort((left, right) => left - right),
    );
  });

  it("bölüm başlıkları ve `Bu cihaz` etiketi referanstan", () => {
    assert.ok(markup.includes("Durum"));
    assert.ok(markup.includes("Ses cihazları"));
    assert.ok(markup.includes("Bu cihaz"));
  });

  it("eylem metinleri referanstan", () => {
    assert.ok(markup.includes("Ayarlar"));
    assert.ok(!markup.includes("Bildirim ayarları"));
    assert.ok(!markup.includes("user-notification-settings-button"));
    assert.ok(markup.includes("Uygulamadan çıkış yap"));
  });

  it("K9 — `Boşta sayılma süresi` menüde yok", () => {
    assert.ok(!markup.includes("Boşta say"));
    assert.ok(!markup.includes("user-presence-idle-timeout"));
  });

  it("giriş seviyesi ölçeri menüde", () => {
    assert.ok(markup.includes('data-testid="user-menu-input-meter"'));
  });

  it("kutunun yarıçapı sözlükten; altta kırpılan gölge yok", () => {
    const { radius, width } = SETTINGS_METRICS.userMenu;
    const menuStyle = markup.match(/data-testid="user-bar-menu" style="([^"]+)"/u)?.[1] ?? "";

    assert.equal(width, 308);
    assert.ok(menuStyle.includes(`border-radius:${radius / 16}rem`));
    assert.ok(!menuStyle.includes("box-shadow:"));
  });

  it("token dışı renk yok", () => {
    const withoutKnob = markup.replaceAll("#fff", "");

    assert.doesNotMatch(withoutKnob, /#[0-9a-f]{3,8}\b/iu);
    assert.doesNotMatch(withoutKnob, /rgba?\(/u);
  });
});

describe("UserBarMenu — kısayol ipucu", () => {
  it("sunucu anlık görüntüsü platform varsaymaz", () => {
    // Sunucuda platform bilinmez; `⌘` sabit gömülmez (§5).
    assert.ok(render().includes("Ctrl/Cmd+,"));
    assert.ok(!render().includes("⌘"));
  });
});

describe("isSettingsShortcut", () => {
  it("`⌘,` ve `Ctrl+,` eşleşir", () => {
    assert.ok(isSettingsShortcut({ key: ",", metaKey: true }));
    assert.ok(isSettingsShortcut({ key: ",", ctrlKey: true }));
  });

  it("değiştiricisiz virgül eşleşmez", () => {
    assert.ok(!isSettingsShortcut({ key: "," }));
    assert.ok(!isSettingsShortcut({ key: "k", metaKey: true }));
  });

  it("`Alt` / `Shift` ile birlikte eşleşmez", () => {
    assert.ok(!isSettingsShortcut({ altKey: true, key: ",", metaKey: true }));
    assert.ok(!isSettingsShortcut({ key: ",", metaKey: true, shiftKey: true }));
  });

  it("yazarken susar", () => {
    assert.ok(!isSettingsShortcut({ key: ",", metaKey: true, target: { tagName: "INPUT" } }));
    assert.ok(
      !isSettingsShortcut({ key: ",", metaKey: true, target: { isContentEditable: true } }),
    );
    assert.ok(isSettingsShortcut({ key: ",", metaKey: true, target: { tagName: "DIV" } }));
  });
});
