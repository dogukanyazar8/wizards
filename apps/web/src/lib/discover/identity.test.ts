import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DiscoverPersonSchema } from "@wizards/types";

import { toCategoryKey, toDiscoverInitials, toServerCategory } from "./identity";

/**
 * SPEC §9 dizininden alınmış tablo — tile metinleri tasarımda birebir bu şekilde yazıyor.
 *
 * Bir satır addan **türetilemez**: `Indie Oyun Geliştirme` tasarımda `IG` çizilir, yani ikinci
 * kelime ("Oyun") atlanıp üçüncüsü alınmış. Aynı tabloda `Oyun Kulübü Türkiye` `OK`'dir, yani
 * üçüncü kelime atlanmış — iki satırı birden üreten konumsal bir kural yok. Tasarımın `IG`si
 * elle yazılmış örnek veridir ve üründe karşılığı `Server.shortName`tir; o yüzden bu satır
 * tabloya kısa adıyla girer. Ayrıntı: `raporlar/01-dalga0-rapor.md`.
 */
const SPEC_DIRECTORY: ReadonlyArray<readonly [name: string, initials: string, shortName?: string]> =
  [
    ["Oyun Kulübü Türkiye", "OK"],
    ["Retro Oyuncular", "RO"],
    ["Turnuva Arena", "TA"],
    ["Indie Oyun Geliştirme", "IG", "IG"],
    ["Startup Türkiye", "ST"],
    ["Ürün Yönetimi", "ÜY"],
    ["Freelance Ağı", "FA"],
    ["Girişimci Kahvesi", "GK"],
    ["Sessiz Çalışma Odası", "SÇ"],
    ["Kodlama Maratonu", "KM"],
    ["Dil Değişimi", "DD"],
    ["Sınav Hazırlık", "SH"],
    ["Kitap Kulübü", "KK"],
    ["Fotoğraf Günlüğü", "FG"],
    ["Yürüyüş ve Doğa", "YD"],
    ["Müzik Keşfi", "MK"],
    ["Whispr Destek", "WD"],
    ["Erişilebilirlik Grubu", "EG"],
    ["Yeni Başlayanlar", "YB"],
    ["Geri Bildirim Odası", "GB"],
  ];

describe("toDiscoverInitials — SPEC §9 dizini", () => {
  it("yirmi sunucunun tamamında tasarımdaki tile metnini üretir", () => {
    const drift = SPEC_DIRECTORY.filter(
      ([name, expected, shortName]) => toDiscoverInitials(name, shortName ?? null) !== expected,
    ).map(
      ([name, expected, shortName]) =>
        `${name}: ${toDiscoverInitials(name, shortName ?? null)} ≠ ${expected}`,
    );

    assert.deepEqual(drift, []);
  });
});

describe("toDiscoverInitials — türetme kuralı", () => {
  it("tek kelimede ilk iki harfi alır", () => {
    assert.equal(toDiscoverInitials("Whispr", null), "WH");
  });

  it("shortName varsa addan değil ondan okur", () => {
    assert.equal(toDiscoverInitials("Whispr Topluluğu", "WSPR"), "WS");
  });

  it("üçüncü kelimeyi görmez", () => {
    assert.equal(toDiscoverInitials("Oyun Kulübü Türkiye", null), "OK");
    // Kısa ad yokken tasarımın elle yazdığı `IG` değil, kuralın ürettiği `IO` çizilir.
    assert.equal(toDiscoverInitials("Indie Oyun Geliştirme", null), "IO");
  });

  it("bağlacı baş harf saymaz", () => {
    // SPEC §9: "Yürüyüş ve Doğa" tasarımda YD çizilir, YV değil.
    assert.equal(toDiscoverInitials("Yürüyüş ve Doğa", null), "YD");
    assert.equal(toDiscoverInitials("Sınav ve Plan", null), "SP");
  });

  it("eleme ilk kelimeyi korur ve iki kelimeye dokunmaz", () => {
    assert.equal(toDiscoverInitials("Ve Yayınları", null), "VY");
    assert.equal(toDiscoverInitials("Ürün ve", null), "ÜV");
  });

  it("Türkçe büyük harf kurallarını uygular", () => {
    // Varsayılan locale bu iki adı `ISTANBUL` ve `IRMAK` yapar; `tr` locale doğrusunu verir.
    assert.equal(toDiscoverInitials("istanbul kulübü", null), "İK");
    assert.equal(toDiscoverInitials("ırmak", null), "IR");
    assert.equal(toDiscoverInitials("işbirliği", null), "İŞ");
  });

  it("noktalamayı baş harf saymaz, rakamı sayar", () => {
    assert.equal(toDiscoverInitials("(Resmî) Destek", null), "RD");
    assert.equal(toDiscoverInitials("8 Bit Kulüp", null), "8B");
  });

  it("tek harf kalırsa harfi tekrarlar", () => {
    assert.equal(toDiscoverInitials("W", null), "WW");
    assert.equal(toDiscoverInitials("Whispr", "W"), "WW");
  });

  it("harf taşımayan adda bilinmeyen tile'ı döner", () => {
    assert.equal(toDiscoverInitials("···", null), "??");
  });

  it("her çıktı şemanın istediği iki karakterdir", () => {
    const names = [
      ...SPEC_DIRECTORY.map(([name]) => name),
      "W",
      "···",
      "8 Bit Kulüp",
      "istanbul kulübü",
    ];

    const invalid = names.filter(
      (name) =>
        !DiscoverPersonSchema.shape.initials.safeParse(toDiscoverInitials(name, null)).success,
    );

    assert.deepEqual(invalid, []);
  });
});

describe("kategori dönüşümü", () => {
  it("her enum değeri bir anahtara gider ve geri döner", () => {
    for (const category of ["OYUN", "IS", "CALISMA", "KISISEL", "DESTEK"] as const) {
      const key = toCategoryKey(category);
      assert.notEqual(key, null);
      assert.equal(toServerCategory(key ?? "all"), category);
    }
  });

  it("null kategori 'all' değil null'dır", () => {
    // "all" kullanıcının filtreyi kapattığını, null sunucunun sınıflandırılmadığını söyler.
    assert.equal(toCategoryKey(null), null);
  });

  it("'all' bir kolon değeri değildir", () => {
    assert.equal(toServerCategory("all"), null);
  });
});
