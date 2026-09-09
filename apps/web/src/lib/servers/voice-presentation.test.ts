import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SERVER_METRICS } from "./metrics";
import {
  orderVoiceParticipants,
  selectVoiceGridColumns,
  selectVoiceLatencyBars,
  selectVoiceLatencyBarsForTier,
  selectVoiceLatencyTier,
  selectVoiceLatencyTierFromQuality,
  selectVoiceSubtitle,
  selectVoiceTileStatus,
} from "./voice-presentation";

/**
 * Ş7 — SPEC-SUNUCU §5'in saf sunum kararları.
 *
 * K5: LiveKit kablolaması `lib/voice/*` altında ve bu şeritte değişmedi. Burada ölçülen tek
 * şey, o veriden ekrandaki cümlenin ve kolon sayısının **nasıl** türediği.
 */

const MINUTE = 60_000;

describe("§5.1 alt satırı", () => {
  it("ekran paylaşımı kamera sayısını gölgeler", () => {
    const model = selectVoiceSubtitle({
      cameraCount: 2,
      connectedAtMs: 0,
      nowMs: 12 * MINUTE,
      participantCount: 4,
      sharerName: "Doğukan",
    });

    assert.equal(model.kind, "screenShare");
    assert.equal(model.minutes, 12);
  });

  it("kamera açıkken kamera biçimini seçer", () => {
    const model = selectVoiceSubtitle({
      cameraCount: 2,
      connectedAtMs: 0,
      nowMs: 12 * MINUTE,
      participantCount: 4,
      sharerName: null,
    });

    assert.equal(model.kind, "camera");
    assert.equal(model.cameraCount, 2);
  });

  it("kamera da paylaşım da yokken düz biçim", () => {
    const model = selectVoiceSubtitle({
      cameraCount: 0,
      connectedAtMs: 0,
      nowMs: MINUTE,
      participantCount: 4,
      sharerName: null,
    });

    assert.equal(model.kind, "plain");
  });

  it("bağlanma damgası yokken süre yazılmaz", () => {
    const model = selectVoiceSubtitle({
      cameraCount: 0,
      connectedAtMs: null,
      nowMs: 0,
      participantCount: 1,
      sharerName: null,
    });

    assert.equal(model.minutes, null);
  });

  it("saat geriye giderse süre negatif olmaz", () => {
    const model = selectVoiceSubtitle({
      cameraCount: 0,
      connectedAtMs: 10 * MINUTE,
      nowMs: 0,
      participantCount: 1,
      sharerName: null,
    });

    assert.equal(model.minutes, 0);
  });
});

describe("§5.2 kart durumu", () => {
  it("konuşma her şeyin önünde", () => {
    assert.equal(
      selectVoiceTileStatus({ isDeafened: true, isMuted: true, isSpeaking: true }),
      "speaking",
    );
  });

  it("sağırlık susturulmanın önünde — kimseyi duymuyor demektir", () => {
    assert.equal(
      selectVoiceTileStatus({ isDeafened: true, isMuted: true, isSpeaking: false }),
      "deafened",
    );
  });

  it("yalnız mikrofon kapalıysa `muted`", () => {
    assert.equal(
      selectVoiceTileStatus({ isDeafened: false, isMuted: true, isSpeaking: false }),
      "muted",
    );
  });

  it("hiçbiri değilse sessiz dinliyor", () => {
    assert.equal(
      selectVoiceTileStatus({ isDeafened: false, isMuted: false, isSpeaking: false }),
      "listening",
    );
  });
});

describe("§5.2 kolon sayısı", () => {
  it("sözlüğün verdiği aralığı aşmaz", () => {
    const { columnsMin, columnsDefault, columnsMax } = SERVER_METRICS.voiceGrid;

    for (const count of [0, 1, 2, 3, 5, 9, 10, 24, 100]) {
      const columns = selectVoiceGridColumns(count);

      assert.ok(columns >= columnsMin, `${count}: ${columns}`);
      assert.ok(columns <= columnsMax, `${count}: ${columns}`);
    }

    assert.equal(selectVoiceGridColumns(Number.NaN), columnsDefault);
  });

  it("iki kişiye kadar iki kolon, dokuza kadar üç, sonrası dört", () => {
    assert.equal(selectVoiceGridColumns(1), 2);
    assert.equal(selectVoiceGridColumns(2), 2);
    assert.equal(selectVoiceGridColumns(3), 3);
    assert.equal(selectVoiceGridColumns(9), 3);
    assert.equal(selectVoiceGridColumns(10), 4);
  });
});

describe("§5.1 gecikme çipi", () => {
  it("milisaniyeden üç kademe türer", () => {
    assert.equal(selectVoiceLatencyTier(32), "good");
    assert.equal(selectVoiceLatencyTier(120), "fair");
    assert.equal(selectVoiceLatencyTier(400), "poor");
  });

  it("LiveKit kalitesinden kademe türer, `unknown` iken çip yok", () => {
    assert.equal(selectVoiceLatencyTierFromQuality("excellent"), "good");
    assert.equal(selectVoiceLatencyTierFromQuality("good"), "fair");
    assert.equal(selectVoiceLatencyTierFromQuality("poor"), "poor");
    assert.equal(selectVoiceLatencyTierFromQuality("lost"), "poor");
    assert.equal(selectVoiceLatencyTierFromQuality("unknown"), null);
  });

  it("yanan çubuk sayısı dört çubuğu aşmaz", () => {
    const total = SERVER_METRICS.voiceHeader.latencyBarHeights.length;

    assert.equal(selectVoiceLatencyBarsForTier("good"), total);
    assert.equal(selectVoiceLatencyBarsForTier("fair"), total - 1);
    assert.equal(selectVoiceLatencyBarsForTier("poor"), 1);
    assert.equal(selectVoiceLatencyBars(32), total);
  });
});

describe("§5.2 kart sırası", () => {
  const rows = [
    { isLocal: false, isSpeaking: false, userId: "a" },
    { isLocal: false, isSpeaking: true, userId: "b" },
    { isLocal: true, isSpeaking: false, userId: "c" },
    { isLocal: false, isSpeaking: true, userId: "d" },
    { isLocal: false, isSpeaking: false, userId: "e" },
  ];

  it("sen önde, konuşanlar sonra, kalan geldiği sırada", () => {
    assert.deepEqual(
      orderVoiceParticipants(rows).map((row) => row.userId),
      ["c", "b", "d", "a", "e"],
    );
  });

  it("sıra kararlı — aynı girdiden hep aynı çıktı", () => {
    assert.deepEqual(orderVoiceParticipants(rows), orderVoiceParticipants(rows));
  });

  it("girdiyi yerinde değiştirmez", () => {
    const input = [...rows];

    orderVoiceParticipants(input);

    assert.deepEqual(
      input.map((row) => row.userId),
      ["a", "b", "c", "d", "e"],
    );
  });
});
