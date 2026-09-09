import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SERVER_METRICS } from "./metrics";
import {
  categoryPreviewName,
  channelFooterSummary,
  isCounterWarning,
  previewChannelName,
} from "./modal-form-model";

describe("sayaç eşiği (00 §6)", () => {
  it("48 karakterlik alanda 40'ta dönmez, 41'de döner", () => {
    // SPEC §6.1 "40'ı geçince warning" — sabit 40 koda yazılmaz, oran sözlükten gelir.
    assert.equal(isCounterWarning(40, 48), false);
    assert.equal(isCounterWarning(41, 48), true);
  });

  it("120 karakterlik alanda 102'de dönmez, 103'te döner", () => {
    assert.equal(isCounterWarning(102, 120), false);
    assert.equal(isCounterWarning(103, 120), true);
  });

  it("eşiği sözlükten okur", () => {
    assert.equal(SERVER_METRICS.modal.counterWarnRatio, 0.85);
  });
});

describe("kategori önizlemesi (§6.1)", () => {
  it("boşken yer tutucuyu döner", () => {
    assert.equal(categoryPreviewName("", "YENİ KATEGORİ"), "YENİ KATEGORİ");
    assert.equal(categoryPreviewName("   ", "YENİ KATEGORİ"), "YENİ KATEGORİ");
  });

  it("adı büyük harfe çevirir", () => {
    assert.equal(categoryPreviewName("Geliştirme", "YENİ KATEGORİ"), "GELİŞTİRME");
  });

  it("Türkçe `i` harfini `İ` yapar, `I` değil", () => {
    // İngilizce kuralla "İletişim" kenar çubuğunda "ILETISIM" görünürdü.
    assert.equal(categoryPreviewName("iletişim", "YENİ KATEGORİ"), "İLETİŞİM");
  });
});

describe("kanal adı önizlemesi", () => {
  it("kullanıcının büyük/küçük harf ve iç boşluk tercihini korur", () => {
    assert.equal(previewChannelName("Sürüm Notları"), "Sürüm Notları");
  });

  it("yalnız güvenli şemanın da kırptığı dış boşlukları kaldırır", () => {
    assert.equal(previewChannelName("  build   durumu  "), "build   durumu");
  });

  it("Türkçe karakterlerin yazımını değiştirmez", () => {
    assert.equal(previewChannelName("IŞIK"), "IŞIK");
  });
});

describe("ayak özeti (§6.2)", () => {
  it("ad boşken uyarı dalına düşer", () => {
    assert.deepEqual(channelFooterSummary("", "TEXT"), { kind: "empty" });
    assert.deepEqual(channelFooterSummary("   ", "VOICE"), { kind: "empty" });
  });

  it("yazı kanalında korunmuş adı taşır", () => {
    assert.deepEqual(channelFooterSummary("Sürüm Notları", "TEXT"), {
      kind: "text",
      name: "Sürüm Notları",
    });
  });

  it("ses kanalında da adı değiştirmez", () => {
    assert.deepEqual(channelFooterSummary("Tasarım Odası", "VOICE"), { kind: "voice" });
  });
});
