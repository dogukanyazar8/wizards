import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  NotificationItem,
  formatNotificationTime,
} from "@/components/notifications/notification-item";
import { getMessagesForLocale } from "@/lib/locale";
import { NOTIF_KIND_GLYPH } from "@/lib/notifications/panel-state";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import type { AppNotification, NotifKind } from "@wizards/types";

/**
 * Ş11 §A.4 — bildirim satırı.
 *
 * Kabul maddesi: **okunmamış durumu renkle değil, `aria-label`'da metinle de** bildirilir.
 * 7 px nokta bir ekran okuyucuya görünmez; testte aranan şey noktanın kendisi değil, etiketin
 * içindeki kelime.
 */

const MESSAGES = getMessagesForLocale("tr");

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    body: "@Doğukan Yazar kart yoğunluğu kararını bugünkü kritiğe alalım mı?",
    createdAt: "2026-08-24T06:41:00.000Z",
    id: "n1",
    kind: "mention",
    read: false,
    title: "Selin Aksoy seni #tasarım-kritiği kanalında etiketledi",
    ...overrides,
  };
}

function render(entry: AppNotification, timeZone = "Europe/Istanbul"): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <NotificationItem notification={entry} onOpen={() => undefined} timeZone={timeZone} />
    </LocaleProvider>,
  );
}

describe("NotificationItem — okunmamış durumu", () => {
  it("links an earned badge notification directly to the badges settings tab", () => {
    const markup = render(notification({ kind: "system", actionUrl: "/settings/badges" }));
    assert.match(markup, /href="\/settings\/account\/badges"/u);
    assert.doesNotMatch(markup, /href="\/settings\/badges"/u);
  });
  it("okunmamış satırın `aria-label`'ı `Okunmadı` taşır", () => {
    const markup = render(notification());

    assert.match(markup, /aria-label="[^"]*Okunmadı"/u);
  });

  it("okunmuş satırın `aria-label`'ı `Okundu` taşır", () => {
    const markup = render(notification({ read: true }));

    assert.match(markup, /aria-label="[^"]*Okundu"/u);
    assert.ok(!markup.includes("Okunmadı"));
  });

  it("etiket satırın içeriğini de taşır — `aria-label` iç metni gölgeliyor", () => {
    const entry = notification();
    const markup = render(entry);
    const label = /aria-label="([^"]*)"/u.exec(markup)?.[1] ?? "";

    assert.ok(label.includes(entry.title.slice(0, 20)));
    assert.ok(label.includes("kart yoğunluğu"));
    assert.ok(label.includes("09:41"));
  });

  it("okunmamışta nokta ve yumuşak zemin, okunmuşta ikisi de yok", () => {
    const unread = render(notification());
    const read = render(notification({ read: true }));
    const { row } = SETTINGS_METRICS.panel;

    assert.ok(unread.includes('data-testid="notification-panel-row-dot"'));
    assert.ok(unread.includes(`hsl(var(--surface-soft) / ${row.unreadSurfaceAlpha})`));
    assert.ok(!read.includes('data-testid="notification-panel-row-dot"'));
    assert.ok(read.includes("background:transparent"));
  });

  it("okunmamış başlık 600, okunmuş 500", () => {
    const { row } = SETTINGS_METRICS.panel;

    assert.ok(render(notification()).includes(`font-weight:${row.unreadWeight}`));
    assert.ok(render(notification({ read: true })).includes(`font-weight:${row.readWeight}`));
  });
});

describe("NotificationItem — tür ikonu", () => {
  it("dört kovanın harfini çizer", () => {
    for (const kind of ["mention", "reply", "event", "system"] as NotifKind[]) {
      const markup = render(notification({ kind }));

      assert.ok(markup.includes(`data-notification-kind="${kind}"`), kind);
      assert.ok(markup.includes(`>${NOTIF_KIND_GLYPH[kind]}<`), kind);
    }
  });

  it("tonu token üzerinden verir, sabit renk yazmaz", () => {
    const markup = render(notification({ kind: "event" }));

    assert.ok(markup.includes("hsl(var(--warning))"));
    assert.ok(!/rgb\(|#[0-9a-f]{6}/iu.test(markup));
  });

  it("sistem satırı yumuşak zemini `--surface-soft`tan alır", () => {
    const markup = render(notification({ kind: "system" }));

    assert.ok(markup.includes("background:hsl(var(--surface-soft))"));
  });

  it("ikon ölçüsü sözlükten", () => {
    const markup = render(notification());
    const { row } = SETTINGS_METRICS.panel;

    assert.ok(markup.includes(`width:${pxToRem(row.iconSize)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(row.iconRadius)}`));
  });
});

describe("formatNotificationTime", () => {
  it("saati gün kovasıyla aynı bölgede, 24 saatlik yazar", () => {
    assert.equal(
      formatNotificationTime("tr", "2026-08-24T06:41:00.000Z", "Europe/Istanbul"),
      "09:41",
    );
    // Aynı an, başka bölge: kova sunucudan geldiği için saat de o bölgede yazılmalı.
    assert.equal(formatNotificationTime("tr", "2026-08-24T06:41:00.000Z", "UTC"), "06:41");
  });

  it("`en` yerel ayarında da 24 saat yazar", () => {
    assert.equal(formatNotificationTime("en", "2026-08-24T21:05:00.000Z", "UTC"), "21:05");
  });

  it("geçersiz bölge satırı düşürmez", () => {
    assert.equal(
      formatNotificationTime("tr", "2026-08-24T06:41:00.000Z", "Mars/Olympus"),
      new Intl.DateTimeFormat("tr", {
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
      }).format(new Date("2026-08-24T06:41:00.000Z")),
    );
  });

  it("ayrıştırılamayan damga boş dize verir", () => {
    assert.equal(formatNotificationTime("tr", "değil-bir-tarih"), "");
  });
});

describe("NotificationItem — navigation", () => {
  it("renders the real destination as a link", () => {
    const markup = render(notification({ actionUrl: "/channels/s/c?message=m" }));
    assert.match(markup, /<a[^>]*href="\/channels\/s\/c\?message=m"/u);
    assert.doesNotMatch(markup, /target="_blank"/u);
  });
  it("opens external destinations outside the app", () => {
    const markup = render(notification({ actionUrl: "https://whispr.team/news" }));
    assert.match(markup, /target="_blank"/u);
    assert.match(markup, /rel="noopener noreferrer"/u);
  });
  it("offers full-text expansion when the notice has no safe destination", () => {
    for (const actionUrl of [null, "javascript:alert(1)"]) {
      const markup = render(notification({ actionUrl }));
      assert.match(markup, /<button[^>]*aria-expanded="false"/u);
      assert.doesNotMatch(markup, /<a[ >]/u);
    }
  });
});
