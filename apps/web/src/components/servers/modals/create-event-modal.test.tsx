import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  CreateEventModalFooter,
  CreateEventModalView,
} from "@/components/servers/modals/create-event-modal";
import { getMessagesForLocale } from "@/lib/locale";
import {
  SERVER_EVENT_INITIAL_STATE,
  type ServerEventChannelOption,
  type ServerEventFormState,
} from "@/lib/servers/event-form";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";

/**
 * Ş9 — etkinlik oluştur penceresi (SPEC-SUNUCU §6.5).
 *
 * `ServerModalShell` gövdeye portallanıyor ve `document` olmayan bir ortamda `null` dönüyor;
 * bu yüzden gövde ve ayak doğrudan sürülüyor.
 */

const MESSAGES = getMessagesForLocale("tr");

/** `noUncheckedIndexedAccess`: sözlükten okunan her anahtar `string | undefined`. */
const copy = (key: string): string => MESSAGES[key] ?? "";

const CHANNELS: readonly ServerEventChannelOption[] = [
  { id: "c-welcome", name: "welcome-chat", type: "TEXT" },
  { id: "c-live", name: "live-room", type: "VOICE" },
];

function state(overrides: Partial<ServerEventFormState> = {}): ServerEventFormState {
  return { ...SERVER_EVENT_INITIAL_STATE, ...overrides };
}

function renderBody(value: ServerEventFormState): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <CreateEventModalView channels={CHANNELS} onChange={() => {}} state={value} />
    </LocaleProvider>,
  );
}

function renderFooter(value: ServerEventFormState): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <CreateEventModalFooter
        channels={CHANNELS}
        onCancel={() => {}}
        onSubmit={() => {}}
        state={value}
        submitting={false}
      />
    </LocaleProvider>,
  );
}

const COMPLETE = state({
  channelId: "c-live",
  date: "18.08.2026",
  endTime: "21:00",
  name: "Sürüm 2.4 canlı demo",
  startTime: "20:00",
});

describe("create event modal", () => {
  it("boş formda `0/60` ve `0/180` sayaçlarını yazar", () => {
    const html = renderBody(state());

    assert.match(html, /0\/60/u);
    assert.match(html, /0\/180/u);
  });

  it("ad alanı `Zorunlu`, açıklama `İsteğe bağlı` rozeti taşır", () => {
    const html = renderBody(state());

    assert.match(html, new RegExp(copy("server.modal.event.required"), "u"));
    assert.match(html, new RegExp(copy("server.modal.event.optional"), "u"));
  });

  it("üç zorunlu alanın her birinde 5px danger nokta var", () => {
    const html = renderBody(state());
    const dot = `width:${pxToRem(SERVER_METRICS.eventModal.requiredDotSize)}`;

    assert.equal(html.split(dot).length - 1, 3);
  });

  it("üç kolonun ızgarası SPEC'in `1.35fr / 1fr / 1fr` oranını kullanır", () => {
    const html = renderBody(state());

    assert.match(
      html,
      new RegExp(
        `minmax\\(0,${SERVER_METRICS.eventModal.gridDateFraction}fr\\) minmax\\(0,1fr\\) minmax\\(0,1fr\\)`,
        "u",
      ),
    );
  });

  it("örnek değerler tasarımdaki gibi", () => {
    const html = renderBody(state());

    assert.match(html, /placeholder="18\.08\.2026"/u);
    assert.match(html, /placeholder="20:00"/u);
    assert.match(html, /placeholder="21:00"/u);
  });

  it("dolu alanın çerçevesi `primary/.5`e döner", () => {
    const empty = renderBody(state());
    const filled = renderBody(state({ date: "18.08.2026" }));

    assert.equal(empty.includes("hsl(var(--primary)/0.5)"), false);
    assert.match(filled, /hsl\(var\(--primary\)\/0\.5\)/u);
  });

  it("kanal çipleri sunucunun kanallarını yazı/ses ayrımıyla çizer", () => {
    const html = renderBody(state());

    assert.match(html, /data-testid="create-event-channel-c-welcome"/u);
    assert.match(html, /data-testid="create-event-channel-c-live"/u);
    // Sesli kanalın hoparlör ikonu success tonunda.
    assert.match(html, /hsl\(var\(--success\)\)/u);
  });

  it("sayaç sınırın %85'ini geçince warning rengine döner", () => {
    const html = renderBody(state({ name: "a".repeat(52) }));

    assert.match(html, /hsl\(var\(--warning\)\)/u);
  });

  it("eksik alanda ayak warning uyarısı yazar ve düğme pasif", () => {
    const html = renderFooter(state());

    assert.match(html, new RegExp(copy("server.modal.event.footer.required"), "u"));
    assert.match(html, /data-testid="create-event-submit"[^>]*disabled/u);
    assert.match(html, /cursor:not-allowed/u);
  });

  it("tamamlanınca ayak özeti yazar ve düğme aktifleşir", () => {
    const html = renderFooter(COMPLETE);

    assert.match(html, /18\.08\.2026 · 20:00–21:00 · live-room/u);
    assert.equal(/data-testid="create-event-submit"[^>]*disabled/u.test(html), false);
    assert.equal(html.includes("cursor:not-allowed"), false);
  });

  it("bitiş başlangıçtan önceyse ayak sözleşmedeki hatayı yazar", () => {
    const html = renderFooter({ ...COMPLETE, endTime: "19:00" });

    assert.match(html, new RegExp(copy("validation.event.endBeforeStart"), "u"));
    assert.match(html, /data-testid="create-event-submit"[^>]*disabled/u);
  });

  it("İptal ve Etkinlik oluştur düğmeleri ayakta", () => {
    const html = renderFooter(COMPLETE);

    assert.match(html, new RegExp(copy("common.cancel"), "u"));
    assert.match(html, new RegExp(copy("server.modal.event.submit"), "u"));
  });
});
