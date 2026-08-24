import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EVENT_RSVP_STRIP_AUTO_DISMISS_MS,
  EventRsvpStrip,
  describeEventRsvpStrip,
  type EventRsvpStripEvent,
} from "@/components/events/event-rsvp-strip";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş8 — RSVP onay şeridi (SPEC §3.4).
 *
 * Alt satırdaki `{n}` **gerçek hatırlatma tercihinden** gelir. Sabit `10` yazmak, 30 dakikaya
 * çekilmiş bir tercihi olan kullanıcıya yanlış bir söz vermek olurdu; `scheduled: false` dönen
 * bir yanıtta ise hatırlatma cümlesi hiç yazılmaz — o bildirim gelmeyecek (tuzak #8).
 */

const MESSAGES = getMessagesForLocale("tr");

/** `noUncheckedIndexedAccess`: sözlükten okunan her anahtar `string | undefined`. */
const text = (key: string): string => MESSAGES[key] ?? "";
const TZ = "Europe/Istanbul";

const EVENT: EventRsvpStripEvent = {
  dayBucket: "today",
  id: "e1",
  reminder: { enabled: true, minutesBefore: 10 },
  startsAt: "2026-08-27T12:00:00.000Z",
  title: "Tasarım Kritiği",
};

function copy(overrides: Partial<Parameters<typeof describeEventRsvpStrip>[0]> = {}) {
  return describeEventRsvpStrip({
    event: EVENT,
    locale: "tr",
    scheduled: true,
    timeZone: TZ,
    ...overrides,
  });
}

function render(props: Partial<React.ComponentProps<typeof EventRsvpStrip>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <EventRsvpStrip event={EVENT} onDismiss={() => {}} scheduled timeZone={TZ} {...props} />
    </LocaleProvider>,
  );
}

describe("events rsvp strip — alt satır", () => {
  it("`{n}` gerçek tercihten gelir, sabit 10 değil", () => {
    const result = copy({
      event: { ...EVENT, reminder: { enabled: true, minutesBefore: 30 } },
    });

    assert.equal(result.key, "events.rsvp.bannerSub");
    assert.equal(result.minutes, 30);
  });

  it("`scheduled: false` ise hatırlatma cümlesi yazılmaz", () => {
    const result = copy({ scheduled: false });

    assert.equal(result.key, "events.rsvp.bannerSubPlain");
    assert.equal(result.minutes, null);
  });

  it("hatırlatma satırı yoksa ya da kapalıysa cümle yazılmaz", () => {
    assert.equal(copy({ event: { ...EVENT, reminder: null } }).key, "events.rsvp.bannerSubPlain");
    assert.equal(
      copy({ event: { ...EVENT, reminder: { enabled: false, minutesBefore: 10 } } }).key,
      "events.rsvp.bannerSubPlain",
    );
  });

  it("bugün ve yarın kovası sözlük anahtarı, diğerleri tarih yazar", () => {
    assert.equal(copy().dayKey, "events.day.today");
    assert.equal(copy().dayText, null);
    assert.equal(
      copy({ event: { ...EVENT, dayBucket: "tomorrow" } }).dayKey,
      "events.day.tomorrow",
    );

    const week = copy({ event: { ...EVENT, dayBucket: "week" } });

    assert.equal(week.dayKey, null);
    assert.equal(week.dayText, "27 Ağustos");
  });

  it("saat izleyicinin bölgesinde 24 saatlik", () => {
    assert.equal(copy().time, "15:00");
    assert.equal(copy({ timeZone: "UTC" }).time, "12:00");
  });
});

describe("events rsvp strip — çizim", () => {
  it("ekran okuyucu yanıtın kaydedildiğini duyar", () => {
    const markup = render();

    assert.match(markup, /role="status"/u);
    assert.match(markup, /aria-live="polite"/u);
  });

  it("başlık ve alt satır sözlükten kurulur", () => {
    const markup = render();

    assert.ok(markup.includes("Tasarım Kritiği etkinliğine katılıyorsun"));
    assert.ok(markup.includes("Bugün 15:00 · başlamadan 10 dk önce hatırlatma gönderilecek"));
  });

  it("`scheduled: false` çizimde de hatırlatma cümlesi taşımaz", () => {
    const markup = render({ scheduled: false });

    assert.ok(markup.includes("Bugün 15:00"));
    assert.equal(markup.includes("hatırlatma gönderilecek"), false);
  });

  it("`Takvime ekle` `.ics` adresini indirir", () => {
    const markup = render();

    assert.ok(markup.includes('href="/api/v1/events/e1/calendar.ics"'));
    assert.ok(markup.includes("download"));
    assert.ok(markup.includes(text("events.rsvp.addToCalendar")));
  });

  it("kapat düğmesi gerçek bir buton ve adı var", () => {
    const markup = render();

    assert.ok(markup.includes(`aria-label="${text("events.rsvp.dismiss")}"`));
    assert.equal(markup.match(/<button/gu)?.length, 1);
  });

  it("şerit sekiz saniyede kapanır", () => {
    assert.equal(EVENT_RSVP_STRIP_AUTO_DISMISS_MS, 8_000);
  });

  it("geçiş yalnız `motion-safe` altında", () => {
    // `prefers-reduced-motion` açıkken şerit doğrudan kaybolur.
    const markup = render();

    assert.ok(markup.includes("motion-safe:"));
    assert.equal(
      /(?<!motion-safe:)transition-/u.test(markup.replace(/motion-safe:transition-/gu, "")),
      false,
    );
  });

  it("ölçüler sözlükten: çıplak px sınıfı yok", () => {
    assert.equal(/-\[-?\d+(\.\d+)?px\]/u.test(render()), false);
  });
});
