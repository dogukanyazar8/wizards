import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VOICE_MESSAGE_MAX_MS, VOICE_MESSAGE_WAVEFORM_BUCKETS } from "@wizards/types";
import {
  VOICE_SAMPLE_INTERVAL_MS,
  buildVoiceMessageFilename,
  computeRms,
  hasReachedRecordingLimit,
  selectRecorderMimeType,
  toLiveWaveform,
  toStoredWaveform,
} from "./voice-capture";

describe("RMS hesabı", () => {
  /**
   * Bayt alanında sessizlik **128**'dir, sıfır değil: örnekler merkezden
   * sapmadır. 0'ı sessizlik saymak, sessiz bir kaydı tam genlik gösterirdi.
   */
  it("sessizliği 128 merkezinden ölçer", () => {
    assert.equal(computeRms(new Uint8Array(64).fill(128)), 0);
  });

  it("tam sapmada 1'e yaklaşır", () => {
    assert.equal(computeRms(new Uint8Array(64).fill(255)), 127 / 128);
    assert.equal(computeRms(new Uint8Array(64).fill(0)), 1);
  });

  it("boş girdide sıfır verir", () => {
    assert.equal(computeRms(new Uint8Array(0)), 0);
  });

  it("kare ortalaması kullanır, mutlak ortalama değil", () => {
    // +64 / -64 dizisi: mutlak ortalama da 0.5 verirdi, ama karelerin ortalaması
    // tam olarak 0.5 ve tepe değerleri bastırmadığı için doğru olan bu.
    const alternating = Uint8Array.from({ length: 64 }, (_unused, index) =>
      index % 2 === 0 ? 192 : 64,
    );

    assert.equal(computeRms(alternating), 0.5);
  });
});

describe("kayıt tavanı", () => {
  it("beş dakikada dolar", () => {
    assert.equal(hasReachedRecordingLimit(VOICE_MESSAGE_MAX_MS - 1), false);
    assert.equal(hasReachedRecordingLimit(VOICE_MESSAGE_MAX_MS), true);
  });

  it("örnekleme aralığı saniyede 20 kova verir", () => {
    assert.equal(1000 / VOICE_SAMPLE_INTERVAL_MS, 20);
  });
});

describe("canlı dalga formu", () => {
  it("her zaman tam kova sayısı döner", () => {
    for (const length of [0, 1, 10, 63, 64, 65, 5000]) {
      const samples = Array.from({ length }, (_unused, index) => (index % 10) / 10);

      assert.equal(toLiveWaveform(samples).length, VOICE_MESSAGE_WAVEFORM_BUCKETS, `${length}`);
    }
  });

  /**
   * Şerit **sondan** dolar. Az örneği 64 kovaya germek, iki saniyelik bir kaydı
   * ekranı dolduran bir duvar gibi gösterirdi.
   */
  it("az örnekte baştan sıfırla doldurur", () => {
    const live = toLiveWaveform([1, 1, 1], 8);

    assert.deepEqual(live.slice(0, 5), [0, 0, 0, 0, 0]);
    assert.ok(live.slice(5).every((value) => value > 0));
  });

  it("çok örnekte son pencereyi gösterir", () => {
    // İlk yarı sessiz, ikinci yarı yüksek: pencere sonu aldığı için çubuklar dolu.
    const samples = [
      ...Array.from({ length: 100 }, () => 0),
      ...Array.from({ length: 64 }, () => 1),
    ];
    const live = toLiveWaveform(samples, 8);

    assert.ok(live.every((value) => value === 100));
  });

  it("boş kayıtta düz sıfır çizer", () => {
    assert.deepEqual(
      toLiveWaveform([]),
      Array.from({ length: VOICE_MESSAGE_WAVEFORM_BUCKETS }, () => 0),
    );
  });
});

describe("saklanan dalga formu", () => {
  it("tam kova sayısı ve 0–100 aralığı verir", () => {
    const stored = toStoredWaveform(Array.from({ length: 500 }, (_unused, i) => (i % 20) / 20));

    assert.equal(stored.length, VOICE_MESSAGE_WAVEFORM_BUCKETS);
    assert.ok(stored.every((value) => Number.isInteger(value) && value >= 0 && value <= 100));
  });
});

describe("kayıt tipi seçimi", () => {
  it("desteklenen ilk adayı seçer", () => {
    assert.equal(
      selectRecorderMimeType((type) => type === "audio/mp4"),
      "audio/mp4",
    );
    assert.equal(
      selectRecorderMimeType(() => true),
      "audio/webm;codecs=opus",
    );
  });

  it("hiçbiri desteklenmiyorsa null döner", () => {
    // Desteklenmeyen bir tiple kaydetmek, kaydın sonunda yüklenemeyen bir dosya
    // demek; çağıran düğmeyi hiç açmaz.
    assert.equal(
      selectRecorderMimeType(() => false),
      null,
    );
  });
});

describe("dosya adı", () => {
  it("uzantıyı kayıt tipinden türetir", () => {
    const at = new Date("2026-08-20T09:26:00.000Z");

    assert.match(buildVoiceMessageFilename("audio/mp4", at), /\.m4a$/);
    assert.match(buildVoiceMessageFilename("audio/webm;codecs=opus", at), /\.webm$/);
  });

  it("indirme klasöründe okunabilir bir ad üretir", () => {
    const name = buildVoiceMessageFilename("audio/webm", new Date("2026-08-20T09:26:00.000Z"));

    // İki nokta Windows dosya adlarında geçersiz; ISO damgasında ikisi de var.
    assert.doesNotMatch(name, /:/);
    assert.equal(name, "voice-2026-08-20T09-26-00-000.webm");
  });
});
