import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { ChannelNotificationsModalView } from "@/components/servers/modals/channel-notifications-modal";
import { getMessagesForLocale } from "@/lib/locale";
import type { ChannelNotificationDraft } from "@/lib/servers/channel-notifications";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";

/** Ş9 — kanal bildirimleri penceresi (SPEC-SUNUCU §6.4). */
const MESSAGES = getMessagesForLocale("tr");

const copy = (key: string): string => MESSAGES[key] ?? "";

function render(draft: ChannelNotificationDraft, saveDisabled = false): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <ChannelNotificationsModalView
        channelName="surum-notlari"
        draft={draft}
        onCancel={() => {}}
        onSelect={() => {}}
        onSubmit={() => {}}
        onToggleMobileMute={() => {}}
        saveDisabled={saveDisabled}
      />
    </LocaleProvider>,
  );
}

describe("channel notifications modal", () => {
  it("üç seçeneği SPEC metinleriyle çizer", () => {
    const html = render({ level: "all", muteMobile: false });

    assert.match(html, new RegExp(copy("server.modal.notifications.all.title"), "u"));
    assert.match(html, new RegExp(copy("server.modal.notifications.mentions.title"), "u"));
    assert.match(html, new RegExp(copy("server.modal.notifications.muted.title"), "u"));
  });

  it("grup `role=radiogroup`, satırlar `role=radio` + `aria-checked`", () => {
    const html = render({ level: "mentions", muteMobile: false });

    assert.match(html, /role="radiogroup"/u);
    assert.equal(html.split('role="radio"').length - 1, 3);
    assert.match(html, /data-level="mentions"[^>]*/u);
    assert.equal(html.split('aria-checked="true"').length - 1, 1);
  });

  it("yalnız seçili satır sekme sırasındadır", () => {
    const html = render({ level: "muted", muteMobile: true });

    assert.equal(html.split('tabindex="0"').length - 1, 1);
    assert.equal(html.split('tabindex="-1"').length - 1, 2);
  });

  it("seçili satırın ikon tonu seçeneğe göre değişir", () => {
    assert.match(render({ level: "all", muteMobile: false }), /hsl\(var\(--primary\)\/0\.16\)/u);
    assert.match(
      render({ level: "mentions", muteMobile: false }),
      /hsl\(var\(--warning\)\/0\.16\)/u,
    );
    assert.match(render({ level: "muted", muteMobile: true }), /hsl\(var\(--danger\)\/0\.16\)/u);
  });

  it("mobil anahtarı `role=switch` ve `Sessiz`te açık gelir", () => {
    const muted = render({ level: "muted", muteMobile: true });
    const all = render({ level: "all", muteMobile: false });

    assert.match(muted, /role="switch"/u);
    assert.match(muted, /data-testid="channel-notifications-mobile-mute"[^>]*/u);
    assert.match(muted, /aria-checked="true"[^>]*data-testid="channel-notifications-mobile-mute"/u);
    assert.match(all, /aria-checked="false"[^>]*data-testid="channel-notifications-mobile-mute"/u);
  });

  it("anahtar 38×21, topuz 15 (SPEC §6.4)", () => {
    const html = render({ level: "all", muteMobile: false });
    const { notificationsModal } = SERVER_METRICS;

    assert.match(html, new RegExp(`width:${pxToRem(notificationsModal.switchWidth)}`, "u"));
    assert.match(html, new RegExp(`height:${pxToRem(notificationsModal.switchHeight)}`, "u"));
    assert.match(html, new RegExp(`width:${pxToRem(notificationsModal.switchKnobSize)}`, "u"));
  });

  it("ayak `İptal` ve `Kaydet` taşır", () => {
    const html = render({ level: "all", muteMobile: false });

    assert.match(html, new RegExp(copy("common.cancel"), "u"));
    assert.match(html, new RegExp(copy("common.save"), "u"));
  });

  it("değişiklik yokken Kaydet pasif", () => {
    const html = render({ level: "all", muteMobile: false }, true);

    assert.match(html, /data-testid="channel-notifications-save"[^>]*disabled/u);
    assert.match(html, /cursor:not-allowed/u);
  });
});
