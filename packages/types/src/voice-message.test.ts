import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VOICE_MESSAGE_MAX_MS,
  VOICE_MESSAGE_WAVEFORM_BUCKETS,
  bucketAmplitudes,
  formatVoiceDuration,
  hasReachedVoiceMessageLimit,
  isVoiceMessageAttachment,
  isVoiceMessageContentType,
  parseWaveform,
  rmsToAmplitude,
  serializeWaveform,
  toVoiceWaveform,
} from "./voice-message";

describe("dalga formu kovaları", () => {
  it("girdi uzunluğu ne olursa olsun tam kova sayısı döner", () => {
    for (const length of [1, 7, 63, 64, 65, 7000]) {
      const samples = Array.from({ length }, (_unused, index) => index % 101);

      assert.equal(
        bucketAmplitudes(samples).length,
        VOICE_MESSAGE_WAVEFORM_BUCKETS,
        `${length} örnek`,
      );
    }
  });

  it("boş girdide düz sıfır çizer", () => {
    assert.deepEqual(
      bucketAmplitudes([]),
      Array.from({ length: VOICE_MESSAGE_WAVEFORM_BUCKETS }, () => 0),
    );
  });

  /**
   * Ortalama alsaydı konuşma tek bir düz banda dönerdi; kaydırırken gözün
   * aradığı çubuk yüksek olandır.
   */
  it("kova zirveyi taşır, ortalamayı değil", () => {
    assert.deepEqual(bucketAmplitudes([0, 100, 0, 0], 2), [100, 0]);
  });

  it("kovadan kısa girdiyi sıfırla doldurmaz, gerer", () => {
    assert.deepEqual(bucketAmplitudes([40, 80], 4), [40, 40, 80, 80]);
  });
});

describe("dBFS ölçeği", () => {
  it("sessizlik sıfırdır", () => {
    assert.equal(rmsToAmplitude(0), 0);
    assert.equal(rmsToAmplitude(-1), 0);
    assert.equal(rmsToAmplitude(Number.NaN), 0);
  });

  it("tam genlik tavandır", () => {
    assert.equal(rmsToAmplitude(1), 100);
  });

  /**
   * Doğrusal çizilseydi yarım genlik yarım çubuk olurdu ve kulak onu "biraz
   * kısık" duyarken göz "neredeyse sessiz" okurdu. −6 dBFS, −60 dB tabanının
   * %90'ıdır.
   */
  it("yarım genliği yarım çubuk yapmaz", () => {
    const half = rmsToAmplitude(0.5);

    assert.ok(half > 85 && half < 95, `yarım genlik ${half} çıktı`);
  });

  it("tabanın altı sıfıra düşer", () => {
    // -60 dBFS = 0.001 linear.
    assert.equal(rmsToAmplitude(0.0009), 0);
  });

  it("ölçek monotondur", () => {
    let previous = -1;
    for (const rms of [0.001, 0.01, 0.05, 0.2, 0.5, 0.8, 1]) {
      const amplitude = rmsToAmplitude(rms);
      assert.ok(amplitude >= previous, `${rms} için ${amplitude} < ${previous}`);
      previous = amplitude;
    }
  });

  it("kayıt örneklerini doğrudan dalga formuna çevirir", () => {
    const waveform = toVoiceWaveform([0, 0.5, 1, 0]);

    assert.equal(waveform.length, VOICE_MESSAGE_WAVEFORM_BUCKETS);
    assert.ok(waveform.every((value) => Number.isInteger(value) && value >= 0 && value <= 100));
    assert.equal(Math.max(...waveform), 100);
  });
});

describe("dalga formu kodlaması", () => {
  it("gidiş dönüş aynı diziyi verir", () => {
    const waveform = [0, 12, 100, 7];

    assert.deepEqual(parseWaveform(serializeWaveform(waveform)), waveform);
  });

  it("boş ve bozuk değerleri boş dizi sayar", () => {
    // Oynatıcı boş dalga formunda düz çubuk çizer; bu dürüst, şekil uydurmak değil.
    assert.deepEqual(parseWaveform(null), []);
    assert.deepEqual(parseWaveform(""), []);
    assert.deepEqual(parseWaveform("bozuk"), []);
  });

  it("aralık dışı değeri kabul etmez", () => {
    assert.deepEqual(parseWaveform("0,101"), []);
    assert.deepEqual(parseWaveform("0,-1"), []);
    assert.throws(() => serializeWaveform([0, 101]));
  });

  it("kova tavanını aşan diziyi reddeder", () => {
    const tooMany = Array.from({ length: VOICE_MESSAGE_WAVEFORM_BUCKETS + 1 }, () => 1);

    assert.throws(() => serializeWaveform(tooMany));
    assert.deepEqual(parseWaveform(tooMany.join(",")), []);
  });

  it("boşluklu girdiyi bağışlar", () => {
    assert.deepEqual(parseWaveform(" 1, 2 ,3 "), [1, 2, 3]);
  });
});

describe("süre", () => {
  it("dakika:saniye biçiminde ve aşağı yuvarlayarak yazar", () => {
    assert.equal(formatVoiceDuration(0), "0:00");
    assert.equal(formatVoiceDuration(7_900), "0:07");
    assert.equal(formatVoiceDuration(64_000), "1:04");
    assert.equal(formatVoiceDuration(720_000), "12:00");
  });

  it("geçersiz süreyi sıfır sayar", () => {
    assert.equal(formatVoiceDuration(Number.NaN), "0:00");
    assert.equal(formatVoiceDuration(-5), "0:00");
  });

  it("beş dakikada tavana ulaşır", () => {
    assert.equal(hasReachedVoiceMessageLimit(VOICE_MESSAGE_MAX_MS - 1), false);
    assert.equal(hasReachedVoiceMessageLimit(VOICE_MESSAGE_MAX_MS), true);
  });
});

describe("sesli mesaj eki ayrımı", () => {
  it("kayıttan gelen sesi tanır", () => {
    assert.equal(
      isVoiceMessageAttachment({ contentType: "audio/webm;codecs=opus", duration: 7 }),
      true,
    );
  });

  /**
   * Kullanıcının eklediği ses **dosyası** da `audio/*`'dır. Süreyi yalnız kayıt
   * yazar; ayrım oradan gelir. Olmasaydı iki saatlik bir podcast yüklemesi,
   * oynatıcının dolduramayacağı bir kaydırma çubuğuyla sesli not gibi çizilirdi.
   */
  it("eklenmiş ses dosyasını sesli mesaj saymaz", () => {
    assert.equal(isVoiceMessageAttachment({ contentType: "audio/mpeg", duration: null }), false);
    assert.equal(isVoiceMessageAttachment({ contentType: "audio/mpeg", duration: 0 }), false);
  });

  it("ses olmayan eki reddeder", () => {
    assert.equal(isVoiceMessageAttachment({ contentType: "image/png", duration: 7 }), false);
  });

  it("içerik tipini parametrelerden arındırarak karşılaştırır", () => {
    assert.equal(isVoiceMessageContentType("AUDIO/WEBM; codecs=opus"), true);
    assert.equal(isVoiceMessageContentType("audio/flac"), false);
  });
});
