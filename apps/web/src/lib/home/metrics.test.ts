import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_METRICS,
  HOME_TYPE_SCALE,
  hairline,
  type HomeTypeScaleStyle,
  pxToEm,
  pxToRem,
} from "./metrics";

const TYPE_SCALE_FAMILIES = new Set(["body", "display"]);

/**
 * Gölge geometrisi tek istisnadır: `offsetX` sıfır, `spread` negatif olabilir.
 * Sözlüğün geri kalanında sıfır ya da negatif bir ölçü her zaman yazım hatasıdır.
 */
const NON_POSITIVE_ALLOWED_ROOT = "shadow";

type MetricPath = { path: string; value: number };

function collectNumbers(value: unknown, path: string, into: MetricPath[]): void {
  if (typeof value === "number") {
    into.push({ path, value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectNumbers(entry, `${path}[${index}]`, into);
    });
    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      collectNumbers(entry, path === "" ? key : `${path}.${key}`, into);
    }
  }
}

describe("home metrics — rem dönüşümü", () => {
  it("tasarım pikselini rem'e çevirir", () => {
    assert.equal(pxToRem(74), "4.625rem");
    assert.equal(pxToRem(272), "17rem");
    assert.equal(pxToRem(13), "0.8125rem");
    assert.equal(pxToRem(16), "1rem");
    assert.equal(pxToRem(20), "1.25rem");
    assert.equal(pxToRem(10.5), "0.65625rem");
  });

  it("ondalık ölçülerde kayan nokta artığı bırakmaz", () => {
    assert.equal(pxToRem(4.5), "0.28125rem");
    assert.equal(pxToRem(14.5), "0.90625rem");
    assert.equal(pxToRem(21.5), "1.34375rem");
  });

  it("hairline değerleri ölçekten muaftır", () => {
    assert.equal(hairline(), "max(1px, 0.0625rem)");
    assert.equal(hairline(1.5), "max(1.5px, 0.09375rem)");
  });

  it("ikon boyutunu em'e çevirir — SPEC §8.2.3'ün tek em istisnası", () => {
    assert.equal(pxToEm(18), "1.125em");
    assert.equal(pxToEm(16), "1em");
    assert.equal(pxToEm(19), "1.1875em");
    assert.equal(pxToEm(2.4), "0.15em");
  });

  it("em ve rem aynı orandan türer, yalnız birim değişir", () => {
    for (const px of [10, 13, 17, 44, 74]) {
      assert.equal(pxToEm(px), pxToRem(px).replace("rem", "em"));
    }
  });

  it("satır kendi font boyutunu verdiğinde ikon tasarım pikselini korur", () => {
    // Nav satırı 14px: 18px ikon 1.125em ile 15,8px çizilirdi.
    assert.equal(pxToEm(18, 14), "1.285714em");
    assert.equal(pxToEm(16, 13), "1.230769em");
    assert.equal(pxToEm(15, 15), "1em");
  });
});

describe("home metrics — sözlük bütünlüğü", () => {
  it("ölçek motorunun taban kabuğunu sabitler", () => {
    assert.equal(HOME_METRICS.shell.minWidth, 1360);
    assert.equal(HOME_METRICS.shell.minHeight, 920);
  });

  it("referans HTML'in taşıyıcı ölçülerini korur", () => {
    assert.equal(HOME_METRICS.shell.radius, 26);
    assert.equal(HOME_METRICS.rail.width, 74);
    // Mesajlar paketi karar #2: panel 272 → 228, üç sol kolon 74 + 228 + 276 = 578.
    assert.equal(HOME_METRICS.panel.width, 228);
    assert.equal(HOME_METRICS.grid.columns, 4);
    assert.equal(HOME_METRICS.grid.gap, 13);
    assert.equal(HOME_METRICS.card.radius, 20);
    assert.equal(HOME_METRICS.friendsStrip.columnSpan, 4);
    // `.w-badge` tek sınıftır: panel satırı ve kart satırı aynı kutuyu çizer.
    assert.deepEqual(HOME_METRICS.badge, {
      fontSize: 11,
      height: 20,
      minWidth: 22,
      paddingX: 6,
      radius: 7,
    });
  });

  it("gölgeler dışında sıfır ya da negatif ölçü taşımaz", () => {
    const numbers: MetricPath[] = [];
    collectNumbers(HOME_METRICS, "", numbers);

    const offenders = numbers.filter(
      (entry) => !entry.path.startsWith(NON_POSITIVE_ALLOWED_ROOT) && entry.value <= 0,
    );

    assert.deepEqual(offenders, []);
    assert.ok(numbers.length > 0, "sözlük boş olamaz");
  });

  it("gölge geometrisinin tamamı sonlu sayıdır", () => {
    const numbers: MetricPath[] = [];
    collectNumbers(HOME_METRICS.shadow, "shadow", numbers);

    const offenders = numbers.filter((entry) => !Number.isFinite(entry.value));

    assert.deepEqual(offenders, []);
  });

  /**
   * `07-faz6` §1: yan ekranların tasarım kaynağı yok, o yüzden ölçüleri ya 07
   * numaralı dosyanın metninde birebir yazılı ya da mevcut bir gruptan aynen
   * alınmış olmak zorunda. Bu test ikinci yarıyı bağlar — bir gün `awaitingCard`
   * satır kutusu değişirse yan ekranlar sessizce ayrışmaz.
   */
  it("yan ekran ölçüleri mevcut gruplardan türer, yeni görsel dil icat etmez", () => {
    const { grid, panel, presenceCard, radius, sideScreens } = HOME_METRICS;

    assert.equal(sideScreens.contentPaddingX, grid.paddingX);
    assert.equal(sideScreens.contentPaddingBottom, grid.paddingBottom);
    assert.equal(sideScreens.contentGap, grid.gap);
    assert.equal(sideScreens.chipGap, presenceCard.chipGridGap);
    assert.equal(sideScreens.calendarGap, presenceCard.chipGridGap);
    assert.equal(sideScreens.calendarCellPadding, presenceCard.chipGridGap);
    assert.equal(sideScreens.calendarCellRadius, radius.serverRow);
    assert.equal(sideScreens.dayPanelWidth, panel.width);
    assert.equal(sideScreens.dayPanelGap, grid.gap);
  });

  it("07 §2.1/§3.3'ün birebir yazılı sayılarını taşır", () => {
    assert.equal(HOME_METRICS.sideScreens.unreadStripeWidth, 3);
    assert.equal(HOME_METRICS.sideScreens.calendarColumns, 7);
    assert.equal(HOME_METRICS.sideScreens.calendarMaxChips, 3);
    assert.equal(HOME_METRICS.sideScreens.calendarTodayAlpha, 0.13);
  });

  it("§1.2'deki bölge gruplarının tamamını taşır", () => {
    assert.deepEqual(Object.keys(HOME_METRICS).sort(), [
      "awaitingCard",
      "badge",
      "card",
      "commandPalette",
      "continueCard",
      "friendsStrip",
      "grid",
      "liveCard",
      "motion",
      "panel",
      "presenceCard",
      "radius",
      "rail",
      "shadow",
      "shell",
      "sideScreens",
      "topBar",
      "upNextCard",
    ]);
  });
});

describe("home metrics — tip ölçeği", () => {
  it("SPEC §1 tablosundaki her rolü taşır", () => {
    assert.deepEqual(Object.keys(HOME_TYPE_SCALE).sort(), [
      "button",
      "cardBigNumber",
      "cardRowName",
      "contextLabel",
      "friendCardName",
      "friendCardStatus",
      "greeting",
      "navRow",
      "panelLogotype",
      "roomName",
      "secondaryLine",
      "sectionLabel",
      "timestamp",
    ]);
  });

  it("her satır geçerli bir aile ve pozitif ölçü taşır", () => {
    for (const [role, style] of Object.entries<HomeTypeScaleStyle>(HOME_TYPE_SCALE)) {
      assert.ok(TYPE_SCALE_FAMILIES.has(style.family), `${role} geçersiz aile: ${style.family}`);
      assert.ok(style.size > 0, `${role} boyutu pozitif olmalı`);
      assert.ok(style.weight >= 400 && style.weight <= 700, `${role} ağırlığı 400–700 aralığında`);

      if (style.lineHeight !== undefined) {
        assert.ok(style.lineHeight > 0, `${role} satır yüksekliği pozitif olmalı`);
      }
    }
  });

  it("SPEC §1'deki bağlayıcı satırları birebir kodlar", () => {
    assert.deepEqual(HOME_TYPE_SCALE.greeting, {
      family: "display",
      lineHeight: 1.1,
      size: 27,
      tracking: "-0.02em",
      weight: 600,
    });
    assert.deepEqual(HOME_TYPE_SCALE.sectionLabel, {
      family: "display",
      lineHeight: 1,
      size: 10.5,
      tracking: "0.15em",
      transform: "uppercase",
      weight: 600,
    });
    assert.equal(HOME_TYPE_SCALE.panelLogotype.weight, 700);
    // Referans HTML logotype'ta `letter-spacing:var(--w-track)` kullanıyor (§1 display kuralı).
    assert.equal(HOME_TYPE_SCALE.panelLogotype.tracking, "-0.02em");
    assert.equal(HOME_TYPE_SCALE.cardBigNumber.size, 27);
    assert.equal(HOME_TYPE_SCALE.navRow.size, 14);
    assert.equal(HOME_TYPE_SCALE.navRow.activeWeight, 600);
    assert.equal(HOME_TYPE_SCALE.button.size, 13);
  });

  it("tip ölçeğinin rem karşılıkları ölçek motoruyla uyumludur", () => {
    assert.equal(pxToRem(HOME_TYPE_SCALE.sectionLabel.size), "0.65625rem");
    assert.equal(pxToRem(HOME_TYPE_SCALE.cardRowName.size), "0.875rem");
    assert.equal(pxToRem(HOME_TYPE_SCALE.roomName.size), "0.9375rem");
  });
});
