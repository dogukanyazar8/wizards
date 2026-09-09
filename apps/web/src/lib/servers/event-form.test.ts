import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CreateServerScheduledEventSchema } from "@wizards/types";

import {
  SERVER_EVENT_DESCRIPTION_MAX_LENGTH,
  SERVER_EVENT_INITIAL_STATE,
  SERVER_EVENT_NAME_MAX_LENGTH,
  buildServerEventPayload,
  clampServerEventDescription,
  clampServerEventName,
  formatServerEventCounter,
  isServerEventCounterWarning,
  parseServerEventDate,
  parseServerEventTime,
  resolveServerEventEntityType,
  selectServerEventFooterNote,
  toServerEventChannelOptions,
  toServerEventLocalValue,
  validateServerEventForm,
  type ServerEventChannelOption,
  type ServerEventFormState,
} from "@/lib/servers/event-form";

/** Ş9 — etkinlik penceresi (SPEC-SUNUCU §6.5). */
const CHANNELS: readonly ServerEventChannelOption[] = [
  { id: "c-welcome", name: "welcome-chat", type: "TEXT" },
  { id: "c-live", name: "live-room", type: "VOICE" },
];

function state(overrides: Partial<ServerEventFormState> = {}): ServerEventFormState {
  return {
    ...SERVER_EVENT_INITIAL_STATE,
    channelId: "c-live",
    date: "18.08.2026",
    endTime: "21:00",
    name: "Sürüm 2.4 canlı demo",
    startTime: "20:00",
    ...overrides,
  };
}

describe("server event form", () => {
  it("K6 sınırları SPEC'in `0/60` ve `0/180` sayaçlarıyla aynı", () => {
    assert.equal(SERVER_EVENT_NAME_MAX_LENGTH, 60);
    assert.equal(SERVER_EVENT_DESCRIPTION_MAX_LENGTH, 180);
    assert.equal(formatServerEventCounter(0, SERVER_EVENT_NAME_MAX_LENGTH), "0/60");
    assert.equal(formatServerEventCounter(0, SERVER_EVENT_DESCRIPTION_MAX_LENGTH), "0/180");
  });

  it("sayaç sınırın %85'ini geçince uyarıya döner", () => {
    assert.equal(isServerEventCounterWarning(51, 60), false);
    assert.equal(isServerEventCounterWarning(52, 60), true);
    assert.equal(isServerEventCounterWarning(153, 180), false);
    assert.equal(isServerEventCounterWarning(154, 180), true);
  });

  it("girdiler sınırda kırpılır", () => {
    assert.equal(clampServerEventName("a".repeat(80)).length, 60);
    assert.equal(clampServerEventDescription("a".repeat(200)).length, 180);
  });

  it("`gg.aa.yyyy` çözümlenir, var olmayan gün reddedilir", () => {
    assert.deepEqual(parseServerEventDate("18.08.2026"), { day: 18, month: 8, year: 2026 });
    assert.equal(parseServerEventDate("31.02.2026"), null);
    assert.equal(parseServerEventDate("2026-08-18"), null);
    assert.equal(parseServerEventDate("1.8.2026"), null);
  });

  it("`ss:dd` çözümlenir, 24:00 ve 60 dakika reddedilir", () => {
    assert.deepEqual(parseServerEventTime("20:00"), { hour: 20, minute: 0 });
    assert.deepEqual(parseServerEventTime("00:59"), { hour: 0, minute: 59 });
    assert.equal(parseServerEventTime("24:00"), null);
    assert.equal(parseServerEventTime("20:60"), null);
  });

  it("iki kutu `datetime-local` biçimine birleşir", () => {
    assert.equal(toServerEventLocalValue("18.08.2026", "20:00"), "2026-08-18T20:00");
    assert.equal(toServerEventLocalValue("18.08.2026", ""), null);
  });

  it("üç zorunlu alan eksikken buton pasif, uyarı warning", () => {
    const note = selectServerEventFooterNote(state({ date: "" }), CHANNELS);

    assert.deepEqual(note, { kind: "warning", messageKey: "server.modal.event.footer.required" });
    assert.equal(validateServerEventForm(state({ date: "" })).valid, false);
    assert.equal(buildServerEventPayload(state({ name: "  " }), CHANNELS), null);
  });

  it("tamamlanınca ayak `tarih · başlangıç–bitiş · kanal` özetini yazar", () => {
    assert.deepEqual(selectServerEventFooterNote(state(), CHANNELS), {
      kind: "summary",
      text: "18.08.2026 · 20:00–21:00 · live-room",
    });
  });

  it("kanal seçilmemişse özet yalnız tarih ve saati taşır", () => {
    assert.deepEqual(selectServerEventFooterNote(state({ channelId: null }), CHANNELS), {
      kind: "summary",
      text: "18.08.2026 · 20:00–21:00",
    });
  });

  it("bitiş başlangıçtan önceyse sözleşmedeki mesajla reddedilir", () => {
    const invalid = state({ endTime: "19:00" });

    assert.deepEqual(validateServerEventForm(invalid).errors, ["endBeforeStart"]);
    assert.deepEqual(selectServerEventFooterNote(invalid, CHANNELS), {
      kind: "error",
      messageKey: "validation.event.endBeforeStart",
    });
    assert.equal(buildServerEventPayload(invalid, CHANNELS), null);
  });

  it("bitiş başlangıca eşitse de reddedilir — şema kesin büyüklük ister", () => {
    assert.deepEqual(validateServerEventForm(state({ endTime: "20:00" })).errors, [
      "endBeforeStart",
    ]);
  });

  it("`entityType` seçilen kanalın türünden türer", () => {
    assert.equal(resolveServerEventEntityType(CHANNELS[1] ?? null), "VOICE");
    assert.equal(resolveServerEventEntityType(CHANNELS[0] ?? null), "EXTERNAL");
    assert.equal(resolveServerEventEntityType(null), "EXTERNAL");
  });

  it("gövde `CreateServerScheduledEventSchema`'dan geçer", () => {
    const payload = buildServerEventPayload(
      state({ description: "Yeni sesli oda motorunu birlikte deniyoruz." }),
      CHANNELS,
    );

    assert.notEqual(payload, null);
    assert.equal(payload?.entityType, "VOICE");
    assert.equal(payload?.channelId, "c-live");
    assert.equal(payload?.name, "Sürüm 2.4 canlı demo");
    assert.equal(CreateServerScheduledEventSchema.safeParse(payload).success, true);
  });

  it("boş açıklama `null` gider, boş dize değil", () => {
    const payload = buildServerEventPayload(state({ description: "   " }), CHANNELS);

    assert.equal(payload?.description, null);
  });

  it("başlangıç ve bitiş izleyicinin yerel duvar saatidir", () => {
    const payload = buildServerEventPayload(state(), CHANNELS);
    const startsAt = new Date(payload?.scheduledStartAt ?? "");
    const endsAt = new Date(payload?.scheduledEndAt ?? "");

    assert.equal(startsAt.getHours(), 20);
    assert.equal(startsAt.getDate(), 18);
    assert.equal(endsAt.getHours(), 21);
  });

  it("kanal çipleri kategori sırasında, kategorisizler sonda", () => {
    const options = toServerEventChannelOptions({
      categories: [
        { channels: [{ id: "b", name: "development", type: "TEXT" }], position: 1 },
        { channels: [{ id: "a", name: "welcome-chat", type: "TEXT" }], position: 0 },
      ],
      ungroupedChannels: [{ id: "z", name: "live-room", type: "VOICE" }],
    });

    assert.deepEqual(
      options.map((option) => option.id),
      ["a", "b", "z"],
    );
  });
});
