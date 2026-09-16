import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventKind, WhisprEvent } from "@wizards/types";

import {
  EVENT_CARD_MIN_HEIGHT,
  EventCard,
  resolveDisplayedRsvp,
  resolveEventRsvpTarget,
  type EventCardProps,
} from "@/components/events/event-card";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş6 — kartın çizim sözleşmesi (SPEC §3.6, `.dc.html` `:335`–`:381`).
 *
 * Kart iki katmandır ve testleri de öyle: **saf** kurallar (iyimser yamanın hangi durumu
 * gösterdiği) doğrudan çağrılır, **çizim** ise statik markup üzerinden okunur. Ortada tıklama
 * yok — düğüm testi koşucusunda DOM yok ve bir tık simülasyonu, kuralın kendisinden daha az
 * şey kanıtlardı.
 */

const { card, grid } = EVENTS_METRICS;
const NOW = new Date("2026-08-27T12:00:00.000Z");

function event(overrides: Partial<WhisprEvent> = {}): WhisprEvent {
  return {
    attendeePreview: [
      { avatarUrl: null, id: "u2", initials: "MK", name: "Mert Kaya", role: "going" },
      { avatarUrl: null, id: "u3", initials: "ZA", name: "Zeynep Arı", role: "going" },
      { avatarUrl: null, id: "u4", initials: "CÖ", name: "Can Öztürk", role: "going" },
    ],
    channelId: "c1",
    channelLabel: "#tasarım-kritiği",
    dayBucket: "today",
    description: "Kart yoğunluğu kararını ele alacağız.",
    durationMinutes: 45,
    endsAt: "2026-08-27T12:45:00.000Z",
    goingCount: 8,
    host: { avatarUrl: null, id: "u1", initials: "SA", name: "Selin Aksoy" },
    id: "e1",
    isLive: false,
    isPublic: false,
    kind: "voice",
    maybeCount: 2,
    recurrenceRule: null,
    reminder: null,
    rsvp: null,
    serverId: "s1",
    serverName: "Whispr Topluluğu",
    startsAt: "2026-08-27T12:00:00.000Z",
    startsInMinutes: null,
    title: "Tasarım Kritiği",
    viewerCanManage: false,
    viewerIsMember: true,
    ...overrides,
  };
}

function render(overrides: Partial<EventCardProps> = {}): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <EventCard event={event()} now={NOW} {...overrides} />
    </LocaleProvider>,
  );
}

/** `hairline()` düz metin döndürüyor ve içinde parantez var; regex'e kaçırılarak girer. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/** `#fff` dışında hiçbir hex kabul edilmez (PROMPT §4 tek istisnası). */
function assertNoHex(markup: string) {
  const withoutAllowed = markup.replaceAll("#fff", "");
  assert.doesNotMatch(withoutAllowed, /#[0-9a-fA-F]{3,8}\b/u);
}

// ---------------------------------------------------------------------------
// Saf kurallar — iyimser RSVP
// ---------------------------------------------------------------------------

describe("EventCard — RSVP hedef durumu", () => {
  it("boş yanıtta basılan düğme hedeftir", () => {
    assert.equal(resolveEventRsvpTarget(null, "going"), "going");
    assert.equal(resolveEventRsvpTarget(null, "maybe"), "maybe");
  });

  it("aynı yanıta ikinci tık yanıtı kaldırır", () => {
    assert.equal(resolveEventRsvpTarget("going", "going"), null);
    // Kabul: "`Belki` ikinci tıkta yanıtı kaldırıyor."
    assert.equal(resolveEventRsvpTarget("maybe", "maybe"), null);
  });

  it("karşı yanıta tık yanıtı çevirir", () => {
    assert.equal(resolveEventRsvpTarget("going", "maybe"), "maybe");
    assert.equal(resolveEventRsvpTarget("maybe", "going"), "going");
  });
});

describe("EventCard — iyimser yamanın gösterdiği yanıt", () => {
  it("yama yokken sunucunun yanıtı gösterilir", () => {
    assert.equal(resolveDisplayedRsvp("going", null), "going");
    assert.equal(resolveDisplayedRsvp(null, null), null);
  });

  it("yama uçuşurken hedef gösterilir", () => {
    assert.equal(resolveDisplayedRsvp(null, { base: null, target: "going" }), "going");
  });

  it("sunucu hedefe yetiştiğinde yama şeffaflaşır", () => {
    assert.equal(resolveDisplayedRsvp("going", { base: null, target: "going" }), "going");
  });

  it("yanıt dışarıdan değiştiyse yama düşer", () => {
    // Detay panelinden `maybe` yazıldıysa kart uçuşan `going` yamasını göstermeye devam
    // edemez: kullanıcı en son o paneli kullandı.
    assert.equal(resolveDisplayedRsvp("maybe", { base: null, target: "going" }), "maybe");
  });
});

// ---------------------------------------------------------------------------
// Bağlantı — kaynak üzerinden
// ---------------------------------------------------------------------------

/** Yorumlar soyulur: bir kuralı anlatan yorum, o kuralı çiğneyen kod sanılmamalı. */
const SOURCE = readFileSync(fileURLToPath(new URL("./event-card.tsx", import.meta.url)), "utf8")
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .replace(/^\s*\/\/.*$/gmu, "");

describe("EventCard — iyimser yamanın bağlandığı yer", () => {
  it("çizim sunucunun yanıtını değil, yamalanmış yanıtı okur", () => {
    assert.match(SOURCE, /resolveDisplayedRsvp\(event\.rsvp, patch\)/u);
  });

  it("tık yamayı hemen yazar", () => {
    assert.match(SOURCE, /setPatch\(\{ base: event\.rsvp, target \}\)/u);
  });

  it("mutasyon reddedilirse yama geri alınır ve toast çıkar", () => {
    const rejection = /\.catch\(\(\) => \{\s*setPatch\(null\);\s*toast\.show\(/u;

    assert.match(SOURCE, rejection);
  });

  it("kart kendi mutasyonunu kurmaz — sayaç ve ray Ş5'in işi", () => {
    assert.doesNotMatch(SOURCE, /useMutation|useQueryClient|setQueryData/u);
  });
});

// ---------------------------------------------------------------------------
// Yapı
// ---------------------------------------------------------------------------

describe("EventCard — yapı ve erişilebilirlik", () => {
  it("kart bir article ve eylem satırında yalnız iki buton var", () => {
    const markup = render();

    assert.match(markup, /<article/u);
    // Başlık + Katıl + Belki. Üç nokta menüsü **yok**.
    assert.equal(markup.match(/<button/gu)?.length, 3);
    assert.doesNotMatch(markup, /aria-haspopup/u);
    assert.doesNotMatch(markup, /data-testid="event-card-menu"/u);
  });

  it("başlık tek klavye hedefi olarak buton içinde", () => {
    const markup = render();

    assert.match(markup, /data-testid="event-card-title"/u);
    assert.match(markup, /aria-label="Tasarım Kritiği etkinliğini aç"/u);
  });

  it("kart erişilebilir adını başlık, gün ve saatten kurar", () => {
    const markup = render();

    assert.match(markup, /aria-label="Tasarım Kritiği · Bugün \d{2}:\d{2}"/u);
  });

  it("avatar yığını aria-hidden; sayı metin olarak yazıyor", () => {
    const markup = render();

    assert.match(markup, /aria-hidden="true"[^>]*data-testid="event-attendee-stack"/u);
    assert.match(markup, /8 kişi katılıyor · Selin Aksoy düzenliyor/u);
  });

  it("hiçbir türde hex yok", () => {
    const kinds: EventKind[] = ["voice", "meeting", "game", "live", "community", "workshop"];

    for (const kind of kinds) {
      assertNoHex(render({ event: event({ kind }) }));
    }
  });
});

// ---------------------------------------------------------------------------
// Tür, canlı ve meta
// ---------------------------------------------------------------------------

describe("EventCard — tür pili", () => {
  const expected: Readonly<Record<EventKind, { glyph: string; label: string; token: string }>> = {
    community: { glyph: "K", label: "Topluluk", token: "--success" },
    game: { glyph: "O", label: "Oyun gecesi", token: "--warning" },
    live: { glyph: "C", label: "Canlı yayın", token: "--danger" },
    meeting: { glyph: "T", label: "Toplantı", token: "--info" },
    voice: { glyph: "S", label: "Sesli buluşma", token: "--primary" },
    workshop: { glyph: "A", label: "Atölye", token: "--info" },
  };

  for (const [kind, { glyph, label, token }] of Object.entries(expected)) {
    it(`${kind} türü ${token} tonunu ve metnini taşır`, () => {
      const markup = render({ event: event({ kind: kind as EventKind }) });

      assert.match(
        markup,
        new RegExp(`background:hsl\\(var\\(${token}\\)/${card.kindSurfaceAlpha}\\)`, "u"),
      );
      assert.match(markup, new RegExp(`color:hsl\\(var\\(${token}\\)\\)`, "u"));
      // Renk tek başına anlam taşımaz: pil metnini de taşır.
      assert.match(markup, new RegExp(`>${label}</span>`, "u"));
      assert.match(markup, new RegExp(`>${glyph}</span>`, "u"));
    });
  }
});

describe("EventCard — canlı pili", () => {
  it("canlı kart hem noktayı hem `Canlı` metnini taşır", () => {
    const markup = render({ event: event({ isLive: true }) });

    assert.match(markup, /data-testid="event-card-live-dot"/u);
    assert.match(markup, />Canlı<\/span>/u);
    assert.match(
      markup,
      new RegExp(`background:hsl\\(var\\(--danger\\)/${card.livePillSurfaceAlpha}\\)`, "u"),
    );
  });

  it("canlı kartta saat satırı `Şu an` ve geçen süre yazar", () => {
    const markup = render({
      event: event({ isLive: true, startsAt: "2026-08-27T10:40:00.000Z" }),
    });

    assert.match(markup, />Şu an</u);
    assert.match(markup, /1 sa 20 dk geçti/u);
  });

  it("canlı olmayan kartta saat ve süre yazar", () => {
    const markup = render();

    assert.match(markup, /45 dk/u);
    assert.doesNotMatch(markup, /Şu an/u);
  });
});

describe("EventCard — tekrar ve yaklaşma satırı", () => {
  it("`Başlamasına {n} dk` yalnız startsInMinutes doluyken", () => {
    assert.match(render({ event: event({ startsInMinutes: 12 }) }), /Başlamasına 12 dk/u);
    assert.doesNotMatch(render(), /Başlamasına/u);
  });

  it("`Her çarşamba` yalnız recurrenceRule doluyken", () => {
    const markup = render({
      event: event({ recurrenceRule: "FREQ=WEEKLY;BYDAY=WE" }),
    });

    assert.match(markup, /Her çarşamba/u);
  });

  it("ikisi birden varsa tekrar yazılır", () => {
    // HTML: `e.repeat || e.soon`.
    const markup = render({
      event: event({ recurrenceRule: "FREQ=WEEKLY;BYDAY=WE", startsInMinutes: 12 }),
    });

    assert.match(markup, /Her çarşamba/u);
    assert.doesNotMatch(markup, /Başlamasına/u);
  });
});

// ---------------------------------------------------------------------------
// Durum
// ---------------------------------------------------------------------------

describe("EventCard — RSVP durumunun çizimi", () => {
  it("katılan kart success kenarını ve `Katılıyorsun` metnini taşır", () => {
    const markup = render({ event: event({ rsvp: "going" }) });

    assert.match(
      markup,
      new RegExp(
        `border:${escapeRegExp(hairline())} solid hsl\\(var\\(--success\\)/${card.goingBorderAlpha}\\)`,
        "u",
      ),
    );
    assert.match(markup, />Katılıyorsun<\/button>/u);
    assert.match(
      markup,
      new RegExp(`background:hsl\\(var\\(--success\\)/${card.actionActiveSurfaceAlpha}\\)`, "u"),
    );
    assert.match(markup, /background:hsl\(var\(--surface-card\)\)/u);
  });

  it("yanıtsız kart soluk zemini ve `Katıl` metnini taşır", () => {
    const markup = render();

    assert.match(
      markup,
      new RegExp(`background:hsl\\(var\\(--surface-card\\)/${card.idleSurfaceAlpha}\\)`, "u"),
    );
    assert.match(markup, />Katıl<\/button>/u);
  });

  it("belki seçiliyken warning zemini ve kenarı", () => {
    const markup = render({ event: event({ rsvp: "maybe" }) });

    assert.match(
      markup,
      new RegExp(`background:hsl\\(var\\(--warning\\)/${card.actionActiveSurfaceAlpha}\\)`, "u"),
    );
    assert.match(
      markup,
      new RegExp(`hsl\\(var\\(--warning\\)/${card.actionActiveBorderAlpha}\\)`, "u"),
    );
  });

  it("seçili kart sol şeridi ve primary kenarı taşır", () => {
    const markup = render({ selected: true });

    assert.match(markup, /data-testid="event-card-stripe"/u);
    assert.match(
      markup,
      new RegExp(
        `border:${escapeRegExp(hairline())} solid hsl\\(var\\(--primary\\)/${card.selectedBorderAlpha}\\)`,
        "u",
      ),
    );
    assert.match(markup, new RegExp(`width:${pxToRem(card.selectedStripeWidth)}`, "u"));
    assert.match(markup, new RegExp(`top:${pxToRem(card.selectedStripeInset)}`, "u"));
  });

  it("hover kenarı ve yükselmesi sınıfta", () => {
    const markup = render();

    assert.match(
      markup,
      new RegExp(`hover:border-\\[hsl\\(var\\(--primary\\)/${card.hoverBorderAlpha}\\)\\]`, "u"),
    );
    assert.match(markup, /hover:\[transform:translateY\(-0\.125rem\)\]/u);
  });
});

// ---------------------------------------------------------------------------
// Kaynak tile — K3
// ---------------------------------------------------------------------------

describe("EventCard — kaynak tile dili (K3)", () => {
  it("üye olunan sunucuda köşeli tile ve sunucunun üç harfli kısaltması", () => {
    const markup = render();

    assert.match(markup, new RegExp(`border-radius:${pxToRem(card.sourceTileRadius)}`, "u"));
    // Sunucu kimliği üç harftir (`deriveServerShortName`); tek harf `TK` işaretiyle
    // karışırdı, o yüzden kare tam kısaltmayı taşır.
    assert.match(markup, />WHI<\/span>/u);
    assert.doesNotMatch(markup, /data-public="true"/u);
  });

  it("üye olunmayan herkese açık etkinlikte tile yuvarlak ve TK", () => {
    const markup = render({
      event: event({ isPublic: true, serverName: "Topluluk", viewerIsMember: false }),
    });

    assert.match(markup, /data-public="true"[^>]*data-testid="event-source-tile"/u);
    assert.match(markup, /border-radius:50%/u);
    assert.match(markup, />TK<\/span>/u);
    assert.match(markup, /background-color:hsl\(var\(--surface-tertiary\)\)/u);
  });

  it("üye olunan sunucunun herkese açık etkinliği normal tile çizer", () => {
    const markup = render({ event: event({ isPublic: true, viewerIsMember: true }) });

    assert.doesNotMatch(markup, /data-public="true"/u);
  });

  it("yer satırı `{sunucu} › {kanal}` yazar", () => {
    assert.match(render(), /Whispr Topluluğu › #tasarım-kritiği/u);
  });
});

// ---------------------------------------------------------------------------
// Avatar yığını
// ---------------------------------------------------------------------------

describe("EventCard — avatar yığını", () => {
  it("ilk avatar bitişik, sonrakiler -8 px kayar ve 2 px halka taşır", () => {
    const markup = render();
    const margins = [...markup.matchAll(/margin-left:(-?[0-9.]+rem|0)/gu)].map((match) => match[1]);

    assert.deepEqual(margins, ["0", pxToRem(card.avatarOverlap), pxToRem(card.avatarOverlap)]);
    assert.match(
      markup,
      new RegExp(
        `box-shadow:0 0 0 ${pxToRem(card.avatarRing)} hsl\\(var\\(--surface-card\\)\\)`,
        "u",
      ),
    );
  });

  it("önizleme boşken yığın hiç çizilmez", () => {
    const markup = render({ event: event({ attendeePreview: [] }) });

    assert.doesNotMatch(markup, /data-testid="event-attendee-stack"/u);
    assert.match(markup, /8 kişi katılıyor/u);
  });
});

// ---------------------------------------------------------------------------
// Yükseklik
// ---------------------------------------------------------------------------

describe("EventCard — yükseklik ölçülerden türer", () => {
  it("kart en az ölçü sözlüğünden gelen yüksekliği taşır", () => {
    const badgeRow = card.kindPillPaddingY * 2 + card.kindPillFontSize;
    const titleLine = card.titleFontSize * card.titleLineHeight;
    const top =
      card.topPaddingTop + Math.max(card.kindTileSize, badgeRow + card.titleMarginTop + titleLine);
    const time =
      card.timePaddingTop +
      card.timeFontSize * card.timeLineHeight +
      card.timeBlockGap +
      Math.max(card.sourceTileSize, card.placeFontSize * card.timeLineHeight);
    const attendees = card.attendeesPaddingTop + card.avatarSize;
    const actions =
      card.actionsMarginTop +
      card.actionsPaddingTop +
      card.actionHeight +
      card.actionsPaddingBottom;

    assert.equal(EVENT_CARD_MIN_HEIGHT, top + time + attendees + actions);
    assert.match(render(), new RegExp(`min-height:${pxToRem(EVENT_CARD_MIN_HEIGHT)}`, "u"));
  });

  it("ızgara asgari kolon genişliği sözlükten gelir", () => {
    assert.equal(grid.minColumnWidth, 280);
    assert.equal(grid.minColumnWidthLarge, 340);
  });
});
