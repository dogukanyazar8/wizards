import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EventCounts, EventsListResponse, WhisprEvent } from "@wizards/types";

import {
  EVENTS_AGENDA_QUERY_KEYS,
  EventAgendaRail,
  agendaGoingQueryInput,
  agendaRailQueryInput,
} from "@/components/events/event-agenda-rail";
import { AccountPreferenceProvider } from "@/components/providers/account-preference-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";

/**
 * Ş7 — sağ ajanda rayı (SPEC §4).
 *
 * Ray kendi iki sorgusunu açıyor; testler onları bir `QueryClient` önbelleğine **hazır veri**
 * koyarak sürüyor (`mention-context-panel.test.tsx` dili). Saat dilimi tercihi açıkça veriliyor:
 * varsayılan `AUTO`, koşan makinenin bölgesine düşer ve `15:00` iddiası makineye göre kayardı.
 */

const { agendaRail, columns } = EVENTS_METRICS;

const SOURCE = readFileSync(
  fileURLToPath(new URL("./event-agenda-rail.tsx", import.meta.url)),
  "utf8",
);

/** Sağ sütunun genişliği ve ayırıcısı Ş5'in sarmalayıcısında; seam burada kilitleniyor. */
const PAGE_SOURCE = readFileSync(
  fileURLToPath(new URL("./events-page.tsx", import.meta.url)),
  "utf8",
);

const COUNTS: EventCounts = {
  all: 8,
  going: 3,
  live: 1,
  liveNow: true,
  nextStartsAt: "2026-08-27T12:00:00.000Z",
  upcoming: 7,
};

function event(overrides: Partial<WhisprEvent> = {}): WhisprEvent {
  return {
    attendeePreview: [],
    channelId: "c1",
    channelLabel: "#tasarım-kritiği",
    dayBucket: "today",
    description: "",
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

function list(items: readonly WhisprEvent[]): EventsListResponse {
  return { counts: COUNTS, items: [...items], nextCursor: null, week: [] };
}

function render({
  going = [event({ dayBucket: "week", id: "g-1", rsvp: "going", title: "Haftalık ürün sync" })],
  selectedEventId = null,
  today = [event()],
  viewerCanCreate = true,
}: {
  going?: readonly WhisprEvent[];
  selectedEventId?: string | null;
  today?: readonly WhisprEvent[];
  viewerCanCreate?: boolean;
} = {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(EVENTS_AGENDA_QUERY_KEYS.today, list(today));
  client.setQueryData(EVENTS_AGENDA_QUERY_KEYS.going, list(going));

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
          <EventAgendaRail
            goingRows={3}
            onOpenCreate={() => {}}
            onOpenDetail={() => {}}
            panelId={selectedEventId}
            rows={4}
            viewerCanCreate={viewerCanCreate}
          />
        </QueryClientProvider>
      </AccountPreferenceProvider>
    </LocaleProvider>,
  );
}

describe("EventAgendaRail — kolon", () => {
  it("`--surface-panel` zemin; sütunu doldurur", () => {
    const markup = render();

    assert.ok(markup.includes("background:hsl(var(--surface-panel))"));
    // Sarmalayıcıyı dolduruyor: kendi genişliğini yazmıyor.
    assert.match(
      markup,
      /class="flex h-full min-h-0 w-full flex-col overflow-hidden"[^>]*data-testid="event-agenda-rail"/u,
    );
  });

  it("sol ayırıcıyı ikinci kez çizmiyor — sarmalayıcı zaten çiziyor", () => {
    assert.ok(
      !render().includes(
        `border-left:${hairline()} solid hsl(var(--border)/${columns.pageDividerAlpha})`,
      ),
    );
  });

  it("sütun 300 px ve panel açıkken ray unmount — `events-page.tsx` sarmalayıcısı", () => {
    assert.match(PAGE_SOURCE, /columns\.agendaRailWidth/u);
    assert.match(PAGE_SOURCE, /columns\.detailPanelWidth/u);
    assert.match(
      PAGE_SOURCE,
      /borderLeft: `\$\{hairline\(\)\} solid hsl\(var\(--border\)\/\$\{columns\.pageDividerAlpha\}\)`/u,
    );
    // Ternary, `hidden` değil: ikisi aynı anda DOM'da olamaz.
    assert.match(PAGE_SOURCE, /detailPanelOpen && routeState\.panel\s*\?\s*renderDetailPanel/u);
    assert.match(PAGE_SOURCE, /:\s*renderAgendaRail\(\{/u);
  });

  it("başlık `Bugün` ve alt satır `{tarih} · {n} etkinlik · {live} canlı`", () => {
    const markup = render({ today: [event(), event({ id: "e-2", isLive: true })] });

    assert.ok(markup.includes("Bugün"));
    assert.match(markup, /2 etkinlik · 1 canlı/u);
  });
});

describe("EventAgendaRail — zaman çizelgesi", () => {
  it("44 px saat kolonu, 1,5 px dikey çizgi, sol 3 px tür şeridi", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(agendaRail.hourColumnWidth)}`));
    assert.ok(markup.includes(`width:${pxToRem(agendaRail.ruleWidth)}`));
    assert.ok(markup.includes(`width:${pxToRem(agendaRail.cardStripeWidth)}`));
    // Çizgi `hairline()` değil: hairline istisnası yalnız 1 px kenarlar içindir.
    assert.ok(!markup.includes(`width:${hairline(agendaRail.ruleWidth)}`));
  });

  it("saat kolonu etkinliğin saatini yazar", () => {
    const markup = render({ today: [event({ startsAt: "2026-08-27T12:00:00.000Z" })] });

    assert.ok(markup.includes("15:00"));
  });

  it("canlı etkinlikte saat yerine `Canlı`, renk `--danger`, sağda 6 px nokta", () => {
    const markup = render({ today: [event({ isLive: true })] });

    assert.ok(markup.includes("Canlı"));
    assert.ok(!markup.includes(">15:00<"));
    assert.ok(markup.includes("color:hsl(var(--danger))"));
    assert.ok(markup.includes(`width:${pxToRem(agendaRail.liveDotSize)}`));
    assert.ok(markup.includes("background:hsl(var(--danger))"));
  });

  it("canlı noktası `aria-hidden`, canlı bilgisi `aria-label` içinde metin", () => {
    const markup = render({ today: [event({ isLive: true })] });

    assert.match(markup, /aria-label="Tasarım Kritiği · Canlı ·/u);
    assert.match(markup, /aria-hidden="true"[^>]*style="[^"]*border-radius:50%/u);
  });

  it("seçili etkinlikte kart `--primary/.1` zemin ve `--primary/.35` kenar", () => {
    const markup = render({ selectedEventId: "e-1" });

    assert.ok(markup.includes(`background:hsl(var(--primary)/${agendaRail.selectedSurfaceAlpha})`));
    assert.ok(
      markup.includes(`${hairline()} solid hsl(var(--primary)/${agendaRail.selectedBorderAlpha})`),
    );
  });

  it("seçili olmayan kart `--surface-card` zemin taşır", () => {
    const markup = render();

    assert.ok(markup.includes("background:hsl(var(--surface-card))"));
    assert.ok(!markup.includes(`hsl(var(--primary)/${agendaRail.selectedSurfaceAlpha})`));
  });

  it("her satır gerçek `<button>` ve başlık + saat + kaynak taşıyan `aria-label`", () => {
    const markup = render();

    assert.match(
      markup,
      /aria-label="Tasarım Kritiği · 15:00 · Whispr Topluluğu › #tasarım-kritiği"/u,
    );
    assert.match(markup, /<button[^>]*data-testid="event-agenda-row"/u);
  });
});

describe("EventAgendaRail — filtre bağımsızlığı", () => {
  it("bugün sorgusu yalnız `tab=all` + `time=today` taşır; ekran filtresi yok", () => {
    assert.deepEqual(agendaRailQueryInput(4), { limit: 4, tab: "all", time: "today" });
  });

  it("`Katılacağım` sorgusu bugüne sınırlı değil — `time` alanı yok", () => {
    assert.deepEqual(agendaGoingQueryInput(3), { limit: 3, tab: "going" });
  });

  it("rayın props'unda hiçbir filtre ekseni yok (serverId / q / tab)", () => {
    const props = /export type EventAgendaRailProps = \{[^}]*\}/su.exec(SOURCE)?.[0] ?? "";

    assert.ok(props.length > 0);
    assert.ok(!/\bsource\b|\bserverId\b|\bquery\b|\btab\b|\bmine\b/u.test(props));
  });

  it("`Katılacağım` bölümü bugün dışındaki etkinliği de çiziyor", () => {
    const markup = render({
      going: [event({ dayBucket: "week", id: "g-1", rsvp: "going", title: "Haftalık ürün sync" })],
    });

    assert.ok(markup.includes("Haftalık ürün sync"));
    assert.ok(markup.includes("Bu hafta"));
  });

  it("`KATILACAĞIM` başlığı ve filtresiz katılım sayacı", () => {
    const markup = render();

    assert.ok(markup.includes(agendaRail.goingSectionLabel.toLocaleUpperCase("tr-TR")));
    assert.ok(markup.includes(`>${COUNTS.going}<`));
  });
});

describe("EventAgendaRail — oluştur girişi (K4)", () => {
  it("`viewerCanCreate` iken tam genişlik `Etkinlik oluştur` butonu", () => {
    const markup = render({ viewerCanCreate: true });

    assert.match(markup, /data-testid="event-agenda-create"/u);
    assert.ok(markup.includes(`height:${pxToRem(agendaRail.footerButtonHeight)}`));
  });

  it("`viewerCanCreate` yokken alt bölüm hiç render edilmiyor — `border-top` da yok", () => {
    const markup = render({ viewerCanCreate: false });

    assert.ok(!markup.includes('data-testid="event-agenda-create"'));
    assert.ok(!markup.includes('data-testid="event-agenda-footer"'));
    assert.ok(
      !markup.includes(
        `border-top:${hairline()} solid hsl(var(--border)/${agendaRail.footerBorderAlpha})`,
      ),
    );
  });
});

describe("EventAgendaRail — ray ↔ panel", () => {
  it("ray detay panelini render etmiyor: ikisi aynı anda DOM'da olamaz", () => {
    assert.ok(!/event-detail-panel/u.test(SOURCE));
    assert.ok(!render().includes('data-testid="event-detail-panel"'));
  });
});
