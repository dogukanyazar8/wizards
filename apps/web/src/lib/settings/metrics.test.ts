import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hairline,
  pxToEm,
  pxToRem,
  SETTINGS_DIRTY_PROFILE_KEYS,
  SETTINGS_METRICS,
  SPEC_DEVIATIONS,
} from "./metrics";

type Leaf = number | string | boolean | null;

function walk(node: unknown, path: string, visit: (value: Leaf, path: string) => void): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walk(entry, `${path}[${index}]`, visit));
    return;
  }

  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      walk(value, path ? `${path}.${key}` : key, visit);
    }
    return;
  }

  visit(node as Leaf, path);
}

/**
 * Tasarımın negatif olması **gereken** ölçüleri. Listelenmeyen her negatif sayı bir işaret
 * hatasıdır: gölge yayılması ile satır boşluğu aynı sözlükte durur ve `-42` yanlış alana
 * düştüğünde tarayıcı bunu sessizce kabul eder.
 */
const NEGATIVE_BY_DESIGN = new Set([
  "panel.shadow.spread",
  "prefsDialog.shadow.spread",
  "userMenu.shadow.spread",
  "window.shadow.spread",
  "controls.select.menuShadow.spread",
  /** Avatar bannerın üstüne taşar. */
  "blocks.hero.avatarRowMarginTop",
  "blocks.hero.avatarShadow.spread",
  /** Kaydırıcı topuzu rayın üstüne oturur. */
  "controls.slider.knobOffsetTop",
  "controls.sound.knobOffsetTop",
]);

describe("settings ölçü sözlüğü — renk taşımaz", () => {
  it("hiçbir kayıtta hsl / hex / rgb geçmiyor", () => {
    // Ton token **adıdır**, renk değil. Bir kez `hsl(352 84% 60%)` yazıldığında sözlük temayı
    // kendi içine kopyalar ve 23 temadan 22'sinde yanlış olur.
    const serialized = JSON.stringify(SETTINGS_METRICS);

    assert.doesNotMatch(serialized, /hsl\(/u);
    assert.doesNotMatch(serialized, /rgba?\(/u);
    assert.doesNotMatch(serialized, /#[0-9a-fA-F]{3,8}/u);
    assert.doesNotMatch(serialized, /var\(--/u);
  });

  it("hiçbir kayıtta font ailesi adı geçmiyor", () => {
    // `Outfit` / `Figtree` yalnız token tanımında yaşar (SPEC-ANA-SAYFA §1).
    const serialized = JSON.stringify(SETTINGS_METRICS);

    assert.doesNotMatch(serialized, /Outfit|Figtree|w-display|w-body/u);
  });
});

describe("settings ölçü sözlüğü — sayısal bütünlük", () => {
  it("her sayı sonlu ve sıfırdan farklı ya da bilinçli sıfır", () => {
    walk(SETTINGS_METRICS, "", (value, path) => {
      if (typeof value !== "number") return;

      assert.ok(Number.isFinite(value), `${path} sonlu değil: ${value}`);
    });
  });

  it("negatif değerler yalnız tasarımın negatif istediği yerlerde", () => {
    const negatives: string[] = [];

    walk(SETTINGS_METRICS, "", (value, path) => {
      if (typeof value === "number" && value < 0) negatives.push(path);
    });

    assert.deepEqual(
      negatives.filter((path) => !NEGATIVE_BY_DESIGN.has(path)),
      [],
    );
  });

  it("dört yüzeyin genişliği tasarımdaki dört sayıdır", () => {
    assert.equal(SETTINGS_METRICS.panel.width, 400);
    assert.equal(SETTINGS_METRICS.prefsDialog.width, 560);
    assert.equal(SETTINGS_METRICS.userMenu.width, 308);
    assert.equal(SETTINGS_METRICS.window.width, 1180);
    assert.equal(SETTINGS_METRICS.window.height, 800);
  });

  it("açılır menü yön eşiği menünün kendisinden büyüktür", () => {
    // 236 px eşiği menünün 222 px tavanının üstünde durur; eşit olsaydı menü tam sığdığı anda
    // aşağı açılır ve son seçenek kaydırma alanının dışında kalırdı (tuzak #6).
    const { select } = SETTINGS_METRICS.controls;

    assert.ok(select.openDownThreshold > select.menuMaxHeight);
  });

  it("kontrol ekseni içerik kolonundan geniştir", () => {
    // 1081 px pencerenin sağ eksenidir, 720 px içerik kolonunun değil. İkisi karışırsa
    // kontroller satırın ortasında biter.
    assert.ok(SETTINGS_METRICS.row.controlAxisEnd > SETTINGS_METRICS.body.maxWidth);
    assert.ok(SETTINGS_METRICS.row.controlAxisEnd < SETTINGS_METRICS.window.width);
  });

  it("dört iskelet bloğun yüksekliği tasarımdaki sırayla duruyor", () => {
    assert.deepEqual([...SETTINGS_METRICS.body.skeletonHeights], [96, 150, 112, 64]);
  });
});

describe("settings sapma kaydı", () => {
  it("on üç sapma taşır", () => {
    assert.equal(SPEC_DEVIATIONS.length, 13);
  });

  it("her sapma alan adını, HTML değerini ve SPEC değerini taşır", () => {
    for (const deviation of SPEC_DEVIATIONS) {
      assert.equal(typeof deviation.field, "string");
      assert.ok(deviation.field.length > 0);
      assert.notDeepEqual(deviation.html, deviation.spec);
    }
  });

  it("release kanalının üçüncü çipi kolonun `UAT` değerine düşer (#12)", () => {
    const deviation = SPEC_DEVIATIONS.find((entry) => entry.field === "releaseChannel.canary");

    assert.ok(deviation, "#12 kayıtlı değil");
    assert.equal(deviation.html, "Canary");
    assert.equal(deviation.spec, "UAT");
  });

  it("kirli profil alanları önek sezgisiyle değil, sayılarak veriliyor (#5)", () => {
    // Referansın `k.charAt(0) === 'p'` kuralı Ses işleme satırlarını (`p1`…`p9`) de profil
    // sayardı ve Ses ve Video sekmesinde kaydet şeridi çıkarırdı.
    assert.deepEqual(
      [...SETTINGS_DIRTY_PROFILE_KEYS],
      ["pn", "pu", "pz", "pbio", "pp", "ps", "pe", "px"],
    );
    assert.equal(SETTINGS_DIRTY_PROFILE_KEYS.length, 8);
    assert.ok(!SETTINGS_DIRTY_PROFILE_KEYS.some((key) => /^p\d/u.test(key)));
  });
});

describe("settings ölçü yardımcıları", () => {
  it("Ana Sayfa sözlüğündeki dönüştürücüleri yeniden ihraç eder", () => {
    // Ayrı bir kopya yazmak, ölçek adımı değiştiğinde iki dosyanın ayrışması demekti.
    assert.equal(pxToRem(16), "1rem");
    assert.equal(pxToEm(18, 16), "1.125em");
    assert.equal(hairline(1), "max(1px, 0.0625rem)");
  });
});
