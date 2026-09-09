import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EVENT_ATTENDEE_ROLE_TONE, type EventAttendee, type WhisprEvent } from "@wizards/types";

import {
  EventDetailPanel,
  applyDetailPanelFocus,
  mergeEventAttendees,
} from "@/components/events/event-detail-panel";
import { AccountPreferenceProvider } from "@/components/providers/account-preference-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { eventsQueryKeys } from "@/lib/events/client";
import type { EventDetailResponse } from "@/lib/events/detail-contract";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş7 — etkinlik detay paneli (SPEC §5).
 *
 * Panel katılımcıları `useInfiniteQuery` ile sayfalıyor; önbelleğe **sayfa kabuğu** konuyor
 * (`{ pageParams, pages }`), tek nesne değil. Ağ sahtelemek panelin ne çizdiğini değil ağın ne
 * döndüğünü test etmek olurdu.
 */

const { columns, detailPanel } = EVENTS_METRICS;

const SOURCE = readFileSync(
  fileURLToPath(new URL("./event-detail-panel.tsx", import.meta.url)),
  "utf8",
);

/** Sütunun genişliği Ş5'in `events-right-column` sarmalayıcısında. */
const PAGE_SOURCE = readFileSync(
  fileURLToPath(new URL("./events-page.tsx", import.meta.url)),
  "utf8",
);

function attendee(overrides: Partial<EventAttendee> = {}): EventAttendee {
  return {
    avatarUrl: null,
    id: "u1",
    initials: "SA",
    name: "Selin Aksoy",
    role: "host",
    ...overrides,
  };
}

function base(): WhisprEvent {
  return {
    attendeePreview: [],
    channelId: "c1",
    channelLabel: "#tasarım-kritiği",
    dayBucket: "today",
    description: "Kart yoğunluğu kararını ve ölçek adımlarını ele alacağız.",
    durationMinutes: 45,
    endsAt: null,
    goingCount: 8,
    host: { avatarUrl: null, id: "u1", initials: "SA", name: "Selin Aksoy" },
    id: "e-1",
    isLive: false,
    isPublic: false,
    kind: "voice",
    maybeCount: 1,
    recurrenceRule: null,
    reminder: { enabled: true, minutesBefore: 10 },
    rsvp: null,
    serverId: "s1",
    serverName: "Whispr Topluluğu",
    startsAt: "2026-08-27T12:00:00.000Z",
    startsInMinutes: null,
    title: "Tasarım Kritiği",
    viewerCanManage: false,
    viewerIsMember: true,
  };
}

function detail(overrides: Partial<EventDetailResponse> = {}): EventDetailResponse {
  return {
    ...base(),
    attendeeMoreCount: 4,
    attendeeNextCursor: "cursor-2",
    attendees: [
      attendee(),
      attendee({ id: "u2", initials: "MK", name: "Mert Kaya", role: "going" }),
    ],
    canJoinLive: false,
    joinHref: null,
    reminderSuppressed: false,
    ...overrides,
  };
}

function render(pages: readonly EventDetailResponse[] = [detail()]): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData([...eventsQueryKeys.details("e-1")], {
    pageParams: pages.map(() => null),
    pages: [...pages],
  });

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <AccountPreferenceProvider
        locale="tr"
        preferences={{
          dateFormat: "LOCALE",
          interfaceDensity: "COMFORTABLE",
          timeFormat: "H24",
          timeZone: "Europe/Istanbul",
        }}
      >
        <QueryClientProvider client={client}>
          <EventDetailPanel eventId="e-1" onClose={() => {}} />
        </QueryClientProvider>
      </AccountPreferenceProvider>
    </LocaleProvider>,
  );
}

describe("EventDetailPanel — kolon", () => {
  it("zemin `--surface-panel`, `--surface-card` DEĞİL (HTML :483)", () => {
    const markup = render();

    assert.ok(markup.includes("background:hsl(var(--surface-panel))"));
    // Kök öğenin zemini kart yüzeyi olamaz; kart yüzeyi yalnız bilgi kartında geçer.
    assert.match(
      markup,
      /data-testid="event-detail-panel"[^>]*style="background:hsl\(var\(--surface-panel\)\)"/u,
    );
  });

  it("326 px sütun sarmalayıcının: panel sol ayırıcıyı ikinci kez çizmiyor", () => {
    assert.ok(
      !render().includes(
        `border-left:${hairline()} solid hsl(var(--border)/${columns.pageDividerAlpha})`,
      ),
    );
    assert.match(PAGE_SOURCE, /columns\.detailPanelWidth/u);
  });

  it('`role="complementary"` ve `aria-label`', () => {
    const markup = render();

    assert.match(markup, /role="complementary"/u);
    assert.match(markup, /aria-label="Etkinlik detayı"/u);
  });

  it("başlıkta 38 px tür tile yuvası, tür pili, süre, başlık ve 30 px kapat", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(detailPanel.kindTileSize)}`));
    assert.ok(markup.includes("Sesli buluşma"));
    assert.ok(markup.includes("45 dk"));
    assert.ok(markup.includes("Tasarım Kritiği"));
    // Kapatma kontrolü uygulamanın tek `WindowCloseButton`'ıdır (Ayarlar başlığı ölçüsü):
    // her pencere aynı hedefi aynı yerde çizsin diye SPEC'in panele özel 30 px kenarsız
    // karesinden bilerek sapılır. `detailPanel.closeSize` tasarım kaydı olarak
    // `lib/events/parity.test.ts` içinde durmaya devam eder.
    assert.ok(markup.includes(`width:${pxToRem(SETTINGS_METRICS.header.closeSize)}`));
    assert.match(markup, /data-testid="event-detail-close"/u);
  });

  it("panel ajanda rayını render etmiyor: ikisi aynı anda DOM'da olamaz", () => {
    assert.ok(!/event-agenda-rail/u.test(SOURCE));
    assert.ok(!render().includes('data-testid="event-agenda-rail"'));
  });
});

describe("EventDetailPanel — gövde blokları", () => {
  it("bilgi kartı `{gün} · {saat} · {süre}`, kaynak ve sahip satırı taşıyor", () => {
    const markup = render();

    assert.ok(markup.includes("Bugün · 15:00 · 45 dk"));
    assert.ok(markup.includes("Whispr Topluluğu › #tasarım-kritiği"));
    assert.ok(markup.includes("Selin Aksoy düzenliyor"));
  });

  it("açıklama dolu iken bölüm etiketiyle çiziliyor", () => {
    const markup = render();

    assert.ok(markup.includes("Açıklama"));
    assert.ok(markup.includes("Kart yoğunluğu kararını"));
  });

  it("açıklama boşken blok hiç çizilmiyor", () => {
    const markup = render([detail({ description: "   " })]);

    assert.ok(!markup.includes("Açıklama"));
    assert.ok(!markup.includes('data-testid="event-detail-description"'));
  });
});

describe("EventDetailPanel — katılımcılar", () => {
  it("dört rol pili de kendi tonunu taşıyor", () => {
    const markup = render([
      detail({
        attendees: [
          attendee({ id: "u1", role: "host" }),
          attendee({ id: "u2", name: "Mert Kaya", role: "going" }),
          attendee({ id: "u3", name: "Zeynep An", role: "maybe" }),
          attendee({ id: "u4", name: "Can Öztürk", role: "listening" }),
        ],
      }),
    ]);

    for (const [role, label] of [
      ["host", "Sahibi"],
      ["going", "Katılıyor"],
      ["maybe", "Belki"],
      ["listening", "Dinliyor"],
    ] as const) {
      assert.ok(markup.includes(label), `${role} pili metni yok`);
      assert.ok(
        markup.includes(
          `hsl(var(${EVENT_ATTENDEE_ROLE_TONE[role]})/${detailPanel.rolePillSurfaceAlpha})`,
        ),
        `${role} pili tonu yok`,
      );
    }
  });

  it("28 px avatar ve ad satırı", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(detailPanel.attendeeAvatarSize)}`));
    assert.ok(markup.includes("Mert Kaya"));
  });

  it("`{n} kişi daha` bağlantısı imleç varken çiziliyor", () => {
    const markup = render();

    assert.ok(markup.includes("4 kişi daha"));
    assert.match(markup, /data-testid="event-detail-more"/u);
  });

  it("imleç bitince `{n} kişi daha` çizilmiyor", () => {
    const markup = render([detail({ attendeeMoreCount: 0, attendeeNextCursor: null })]);

    assert.ok(!markup.includes('data-testid="event-detail-more"'));
  });

  it("ikinci sayfa aynı kişiyi tekrarlamıyor", () => {
    const first = [
      attendee({ id: "u1" }),
      attendee({ id: "u2", name: "Mert Kaya", role: "going" }),
    ];
    const second = [
      attendee({ id: "u2", name: "Mert Kaya", role: "going" }),
      attendee({ id: "u3", name: "Zeynep An", role: "maybe" }),
    ];

    const merged = mergeEventAttendees([first, second]);

    assert.deepEqual(
      merged.map((person) => person.id),
      ["u1", "u2", "u3"],
    );
  });

  it("ikinci sayfa panelde tek kez görünüyor", () => {
    const markup = render([
      detail(),
      detail({
        attendeeMoreCount: 0,
        attendeeNextCursor: null,
        attendees: [
          attendee({ id: "u2", name: "Mert Kaya", role: "going" }),
          attendee({ id: "u3", name: "Zeynep An", role: "maybe" }),
        ],
      }),
    ]);

    // `>ad<` ad satırının kendisi; `aria-label="ad"` avatarın kimliği ve her satırda bir kez
    // daha geçiyor. Sayılan şey çizilen **satır**.
    assert.equal(markup.split(">Mert Kaya<").length - 1, 1);
    assert.equal(markup.split('data-testid="event-detail-attendee"').length - 1, 3);
    assert.ok(markup.includes("Zeynep An"));
  });
});

describe("EventDetailPanel — CTA (Ş2'nin üç alanı)", () => {
  it("`rsvp === going` → `Katılımı geri al`, zemin `--surface-tertiary`", () => {
    const markup = render([
      detail({ canJoinLive: true, joinHref: "/channels/s1/c1", rsvp: "going" }),
    ]);

    assert.ok(markup.includes("Katılımı geri al"));
    assert.ok(markup.includes("background:hsl(var(--surface-tertiary))"));
    assert.ok(markup.includes("color:hsl(var(--text-secondary))"));
    assert.ok(!markup.includes("Yayına katıl"));
  });

  it("`canJoinLive` → `Yayına katıl`, `--primary` zemin ve `joinHref` taşıyan bağlantı", () => {
    const markup = render([
      detail({ canJoinLive: true, isLive: true, joinHref: "/channels/s1/c1" }),
    ]);

    assert.ok(markup.includes("Yayına katıl"));
    assert.match(markup, /<a[^>]*href="\/channels\/s1\/c1"/u);
    assert.ok(markup.includes("background:hsl(var(--primary))"));
  });

  it("diğer → `Katıl`, `--primary` zemin", () => {
    const markup = render();

    assert.ok(markup.includes(">Katıl<"));
    assert.ok(markup.includes("background:hsl(var(--primary))"));
    assert.ok(!markup.includes("Yayına katıl"));
  });

  it("altlıkta `Paylaş` butonu var; `.ics` indirmesi burada değil (Ş8)", () => {
    const markup = render();

    assert.ok(markup.includes("Paylaş"));
    assert.ok(!markup.includes("calendar.ics"));
    assert.ok(!markup.includes("Takvime ekle"));
  });
});

describe("EventDetailPanel — odak ve `Esc`", () => {
  it("açılışta odak kapatma butonunda, kapanışta tetikleyiciye dönüyor", () => {
    const focused: string[] = [];
    const closeButton = { focus: () => focused.push("close") };
    const trigger = { focus: () => focused.push("trigger") };

    const restore = applyDetailPanelFocus(closeButton, trigger);
    assert.deepEqual(focused, ["close"]);

    restore();
    assert.deepEqual(focused, ["close", "trigger"]);
  });

  it("tetikleyici yokken kapanışta hiçbir şeye odaklanmıyor", () => {
    const focused: string[] = [];
    const restore = applyDetailPanelFocus({ focus: () => focused.push("close") }, null);

    restore();
    assert.deepEqual(focused, ["close"]);
  });

  it("panel kendi `Esc` dinleyicisini kurmuyor — merdiven Ş5'te", () => {
    assert.ok(!/keydown/u.test(SOURCE));
    assert.ok(!/"Escape"/u.test(SOURCE));
    assert.ok(!/closeTransient/u.test(SOURCE));
  });
});
