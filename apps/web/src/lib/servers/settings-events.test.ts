import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServerScheduledEvent } from "@wizards/types";

import {
  SERVER_EVENTS_TABS,
  canCancelServerEvent,
  canEditServerEvent,
  countServerEventsForTab,
  formatServerEventTimeRange,
  selectServerEventsForTab,
  toServerEventDateBox,
} from "./settings-events";

function event(overrides: Partial<ServerScheduledEvent> & Pick<ServerScheduledEvent, "id">) {
  return {
    attendeeCount: 0,
    channelId: null,
    channelName: null,
    description: null,
    entityType: "EXTERNAL",
    externalLocation: null,
    interestedCount: 0,
    name: overrides.id,
    scheduledEndAt: null,
    scheduledStartAt: "2026-08-25T17:00:00.000Z",
    serverId: "s-1",
    status: "SCHEDULED",
    viewerInterested: false,
    ...overrides,
  } as ServerScheduledEvent;
}

describe("iki sekme tek listeden türer", () => {
  it("segment sırası `Yaklaşan` · `İptal edilen`", () => {
    assert.deepEqual(SERVER_EVENTS_TABS, ["upcoming", "cancelled"]);
  });

  it("`Yaklaşan` yalnız canlı etkinlikleri alır", () => {
    const rows = selectServerEventsForTab(
      [
        event({ id: "a", status: "SCHEDULED" }),
        event({ id: "b", status: "ACTIVE" }),
        event({ id: "c", status: "CANCELLED" }),
        event({ id: "d", status: "COMPLETED" }),
      ],
      "upcoming",
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ["a", "b"],
    );
  });

  it("`İptal edilen` yalnız `CANCELLED` alır; `COMPLETED` hiçbir sekmede yok", () => {
    const rows = selectServerEventsForTab(
      [event({ id: "c", status: "CANCELLED" }), event({ id: "d", status: "COMPLETED" })],
      "cancelled",
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ["c"],
    );
    assert.equal(countServerEventsForTab([event({ id: "d", status: "COMPLETED" })], "upcoming"), 0);
  });

  it("başlangıç anına göre sıralar", () => {
    const rows = selectServerEventsForTab(
      [
        event({ id: "late", scheduledStartAt: "2026-09-01T10:00:00.000Z" }),
        event({ id: "early", scheduledStartAt: "2026-08-26T10:00:00.000Z" }),
      ],
      "upcoming",
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ["early", "late"],
    );
  });
});

describe("kartın tarih kutusu ve saat çipi", () => {
  it("gün ve büyük harf kısa ay verir", () => {
    const box = toServerEventDateBox("2026-08-18T17:00:00.000Z", "tr");

    assert.equal(box.day, "18");
    assert.equal(box.month, box.month.toLocaleUpperCase("tr"));
    assert.ok(box.month.length > 0);
  });

  it("bozuk tarih uydurulmuş bir gün üretmez", () => {
    assert.deepEqual(toServerEventDateBox("değil", "tr"), { day: "--", month: "" });
  });

  it("bitiş yoksa yalnız başlangıç yazar", () => {
    const single = formatServerEventTimeRange("2026-08-18T17:00:00.000Z", null, "tr");

    assert.equal(single.includes("–"), false);
    assert.ok(single.length > 0);
  });

  it("aralık en tire ile birleşir", () => {
    const range = formatServerEventTimeRange(
      "2026-08-18T17:00:00.000Z",
      "2026-08-18T18:00:00.000Z",
      "tr",
    );

    assert.ok(range.includes("–"));
  });
});

describe("kartın iki düğmesi", () => {
  it("iptal edilmiş etkinlik düzenlenemez ve tekrar iptal edilemez", () => {
    const cancelled = event({ id: "c", status: "CANCELLED" });

    assert.equal(canEditServerEvent(cancelled), false);
    assert.equal(canCancelServerEvent(cancelled), false);
  });

  it("canlı etkinlikte ikisi de açık", () => {
    const live = event({ id: "a", status: "SCHEDULED" });

    assert.equal(canEditServerEvent(live), true);
    assert.equal(canCancelServerEvent(live), true);
  });

  it("bitmiş etkinlik düzenlenebilir ama iptal edilemez", () => {
    const done = event({ id: "d", status: "COMPLETED" });

    assert.equal(canEditServerEvent(done), true);
    assert.equal(canCancelServerEvent(done), false);
  });
});
