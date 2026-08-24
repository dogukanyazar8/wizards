import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EventReminder, EventRsvp } from "@wizards/types";

import {
  EVENT_REMINDER_MENU_MINUTES,
  EventReminderStrip,
  resolveEventReminderState,
} from "@/components/events/event-reminder-strip";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş7 — hatırlatma şeridi (SPEC §5.4, K5).
 *
 * Üç özel durumun ikisi bir **yazma yanıtından** doğuyor (`scheduled: false`) ya da hesap
 * tercihinden geliyor (`reminderSuppressed`); ikisi de SSR çıktısında bir tıkla üretilemez.
 * Bu yüzden durum seçimi saf bir çözümleyicide duruyor ve şerit onu çağırıyor: kural bir kez
 * yazılıyor, iki kez test edilebiliyor.
 */

const { detailPanel } = EVENTS_METRICS;

const SOURCE = readFileSync(
  fileURLToPath(new URL("./event-reminder-strip.tsx", import.meta.url)),
  "utf8",
);

function render({
  reminder = { enabled: true, minutesBefore: 10 } as EventReminder | null,
  rsvp = "going" as EventRsvp | null,
  scheduled = null as boolean | null,
  suppressed = false,
} = {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <QueryClientProvider client={client}>
        <EventReminderStrip
          eventId="e-1"
          reminder={reminder}
          rsvp={rsvp}
          scheduled={scheduled}
          suppressed={suppressed}
        />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("resolveEventReminderState — üç özel durum", () => {
  it("izleyici `going` değilse şerit çizilmez — hatırlatma bir RSVP sonucudur", () => {
    assert.deepEqual(
      resolveEventReminderState({
        reminder: { enabled: true, minutesBefore: 10 },
        rsvp: null,
        scheduled: null,
        suppressed: false,
      }),
      { kind: "hidden" },
    );

    assert.deepEqual(
      resolveEventReminderState({
        reminder: { enabled: true, minutesBefore: 10 },
        rsvp: "maybe",
        scheduled: null,
        suppressed: false,
      }),
      { kind: "hidden" },
    );
  });

  it("`reminderSuppressed` her şeyi ezer — tercih saklı, bildirim kapalı", () => {
    assert.deepEqual(
      resolveEventReminderState({
        reminder: { enabled: true, minutesBefore: 30 },
        rsvp: "going",
        scheduled: true,
        suppressed: true,
      }),
      { kind: "suppressed" },
    );
  });

  it("`scheduled: false` → etkinlik çok yakın; tercih yine gösterilir", () => {
    assert.deepEqual(
      resolveEventReminderState({
        reminder: { enabled: true, minutesBefore: 10 },
        rsvp: "going",
        scheduled: false,
        suppressed: false,
      }),
      { kind: "tooSoon", minutesBefore: 10 },
    );
  });

  it("açık tercih → `on`, kapalı ya da yok → `off`", () => {
    assert.deepEqual(
      resolveEventReminderState({
        reminder: { enabled: true, minutesBefore: 15 },
        rsvp: "going",
        scheduled: null,
        suppressed: false,
      }),
      { kind: "on", minutesBefore: 15 },
    );

    assert.deepEqual(
      resolveEventReminderState({
        reminder: { enabled: false, minutesBefore: 15 },
        rsvp: "going",
        scheduled: null,
        suppressed: false,
      }),
      { kind: "off" },
    );

    assert.deepEqual(
      resolveEventReminderState({
        reminder: null,
        rsvp: "going",
        scheduled: null,
        suppressed: false,
      }),
      { kind: "off" },
    );
  });
});

describe("EventReminderStrip — çizim", () => {
  it("`going` değilken hiçbir şey render etmiyor", () => {
    assert.equal(render({ rsvp: "maybe" }), "");
    assert.equal(render({ rsvp: null }), "");
  });

  it("açık tercihte `Hatırlatma açık` / `Başlamadan {n} dk önce` / `Değiştir`", () => {
    const markup = render();

    assert.ok(markup.includes("Hatırlatma açık"));
    assert.ok(markup.includes("Başlamadan 10 dk önce"));
    assert.ok(markup.includes("Değiştir"));
  });

  it("zemin `--surface-secondary/.8`, zil ikonu `--warning`", () => {
    const markup = render();

    assert.ok(
      markup.includes(
        `background:hsl(var(--surface-secondary)/${detailPanel.reminderSurfaceAlpha})`,
      ),
    );
    assert.ok(markup.includes("hsl(var(--warning))"));
    assert.ok(markup.includes(`border-radius:${pxToRem(detailPanel.reminderRadius)}`));
  });

  it("`reminderSuppressed` durumunda ayarlara giden bağlantı, `Değiştir` yok", () => {
    const markup = render({ suppressed: true });

    assert.ok(markup.includes("Bildirimler kapalı"));
    assert.match(markup, /href="\/settings\?section=notifications"/u);
    assert.ok(!markup.includes("Değiştir"));
  });

  it("`scheduled: false` durumunda etkinliğin çok yakın olduğunu söylüyor", () => {
    const markup = render({ scheduled: false });

    assert.ok(markup.includes("Etkinlik çok yakın, hatırlatma gönderilmeyecek"));
    assert.ok(markup.includes("Başlamadan 10 dk önce"));
    assert.ok(markup.includes("Değiştir"));
  });

  it("kapalı tercihte `Hatırlatma kapalı`", () => {
    const markup = render({ reminder: { enabled: false, minutesBefore: 10 } });

    assert.ok(markup.includes("Hatırlatma kapalı"));
  });
});

describe("EventReminderStrip — menü ve yazma", () => {
  it("seçenekler K5'in beş dakikası", () => {
    assert.deepEqual([...EVENT_REMINDER_MENU_MINUTES], [5, 10, 15, 30, 60]);
  });

  it("menüde ayrıca `Hatırlatma kapalı` satırı var", () => {
    assert.match(SOURCE, /events\.detail\.reminderOff/u);
  });

  it("seçim `setEventReminder` ile Ş3'ün ucuna gidiyor ve iyimser güncelleniyor", () => {
    assert.match(SOURCE, /setEventReminder\(/u);
    assert.match(SOURCE, /setQueryData/u);
  });
});
