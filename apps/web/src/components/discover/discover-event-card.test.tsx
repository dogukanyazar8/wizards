import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverEvent } from "@wizards/types";

import {
  DiscoverEventCard,
  formatDiscoverEventTime,
} from "@/components/discover/discover-event-card";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

const NOW = new Date("2026-08-21T09:00:00.000Z");
const TIME_ZONE = "Europe/Istanbul";
const noop = () => undefined;

function event(overrides: Partial<DiscoverEvent> = {}): DiscoverEvent {
  return {
    durationLabel: "1 sa",
    entityType: "STAGE",
    id: "event-1",
    interested: false,
    interestedCount: 128,
    locationLabel: "Whispr Topluluğu › Topluluk sahnesi",
    name: "Topluluk sohbeti: Whispr yol haritası",
    scheduledStartAt: "2026-08-22T17:00:00.000Z",
    serverId: "server-1",
    ...overrides,
  };
}

function render(item: DiscoverEvent): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DiscoverEventCard
        event={item}
        now={NOW}
        onOpen={noop}
        onToggleInterest={noop}
        onViewDetails={noop}
        timeZone={TIME_ZONE}
      />
    </LocaleProvider>,
  );
}

describe("formatDiscoverEventTime", () => {
  const format = (scheduledStartAt: string) =>
    formatDiscoverEventTime({ locale: "tr", now: NOW, scheduledStartAt, timeZone: TIME_ZONE });

  it("bugünkü etkinliği Bugün HH:mm biçiminde yazar", () => {
    assert.equal(format("2026-08-21T11:00:00.000Z"), "Bugün 14:00");
  });

  it("yarınki etkinliği Yarın HH:mm biçiminde yazar", () => {
    assert.equal(format("2026-08-22T11:00:00.000Z"), "Yarın 14:00");
  });

  it("yedi gün içindeki etkinliği kısa günle yazar", () => {
    assert.equal(format("2026-08-24T11:00:00.000Z"), "Pzt 14:00");
  });

  it("uzak etkinliği gün ve kısa ayla yazar", () => {
    assert.equal(format("2026-08-29T11:00:00.000Z"), "29 Ağu 14:00");
  });
});

describe("DiscoverEventCard", () => {
  it("article kökü, tam kart düğmesi ve iki eylem düğmesi çizer", () => {
    const markup = render(event());

    assert.ok(markup.startsWith("<article"));
    assert.equal(markup.match(/type="button"/g)?.length, 3);
    assert.ok(markup.includes("İlgileniyorum"));
    assert.ok(markup.includes("Detay"));
    assert.ok(!markup.includes("lucide-badge-check"));
  });

  it("boş durationLabel için süre parçası çizmez", () => {
    const markup = render(event({ durationLabel: "" }));

    assert.ok(!markup.includes('data-testid="discover-event-duration"'));
  });

  it("ilgilenilen etkinlik basılı durum taşır", () => {
    const markup = render(event({ interested: true }));

    assert.ok(markup.includes('aria-pressed="true"'));
  });

  it("render sırasında fetch çağırmaz", (context) => {
    let calls = 0;
    context.mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response();
    });

    render(event());
    assert.equal(calls, 0);
  });
});
