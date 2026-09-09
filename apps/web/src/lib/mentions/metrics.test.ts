import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HOME_METRICS } from "@/lib/home/metrics";

import {
  MENTIONS_DENSITY,
  MENTIONS_METRICS,
  SPEC_DEVIATIONS,
  hairline,
  pxToEm,
  pxToRem,
} from "./metrics";

/**
 * Gölge geometrisinde `x` sıfır, `spread` negatiftir. Sözlüğün geri kalanında sıfır ya da
 * negatif bir ölçü yazım hatasıdır — bu iki yaprak onun istisnası.
 */
const SIGNED_LEAVES = new Set(["spread", "x"]);

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

function collectStrings(value: unknown, path: string, into: { path: string; value: string }[]) {
  if (typeof value === "string") {
    into.push({ path, value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectStrings(entry, `${path}[${index}]`, into);
    });
    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      collectStrings(entry, path === "" ? key : `${path}.${key}`, into);
    }
  }
}

function readMetric(path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, MENTIONS_METRICS);
}

describe("mentions metrics — dönüşümler", () => {
  it("tasarım pikselini rem'e çevirir", () => {
    assert.equal(pxToRem(276), "17.25rem");
    assert.equal(pxToRem(326), "20.375rem");
    assert.equal(pxToRem(496), "31rem");
    assert.equal(pxToRem(13.5), "0.84375rem");
  });

  it("ikon boyutunu satırın font boyutuna göre em'e çevirir", () => {
    // 13px thread ikonu, 11.5px'lik bir satırda: 13/11.5 ≈ 1.130435em.
    assert.equal(pxToEm(13, 11.5), "1.130435em");
    assert.equal(pxToEm(16), "1em");
  });

  it("hairline fiziksel tabanı korur", () => {
    assert.equal(hairline(), "max(1px, 0.0625rem)");
  });
});

describe("mentions metrics — sözlük sözleşmesi", () => {
  it("renk taşımaz", () => {
    const strings: { path: string; value: string }[] = [];
    collectStrings(MENTIONS_METRICS, "", strings);

    const colorLike = strings.filter(({ value }) =>
      /#[0-9a-f]{3,8}\b|\bhsl\(|\brgba?\(|\boklch\(/i.test(value),
    );

    assert.deepEqual(
      colorLike.map(({ path }) => path),
      [],
      "Ölçü sözlüğü renk taşımaz; tonu tüketici hsl(var(--token)) ile verir.",
    );
  });

  it("ölçüleri pozitiftir", () => {
    const numbers: MetricPath[] = [];
    collectNumbers(MENTIONS_METRICS, "", numbers);

    const invalid = numbers.filter(({ path, value }) => {
      const leaf = path.split(".").at(-1) ?? "";

      if (SIGNED_LEAVES.has(leaf)) {
        return !Number.isFinite(value);
      }

      return !Number.isFinite(value) || value <= 0;
    });

    assert.deepEqual(
      invalid.map(({ path, value }) => `${path}=${value}`),
      [],
    );
  });

  it("her SPEC sapması sözlükte HTML değeriyle duruyor", () => {
    for (const deviation of SPEC_DEVIATIONS) {
      assert.equal(
        readMetric(deviation.field),
        deviation.html,
        `${deviation.field} sapma kaydındaki HTML değerini taşımalı.`,
      );
    }
  });
});

describe("mentions metrics — SPEC §1 kabuk ve kolonlar", () => {
  it("sol üç kolon 630'dur ve akışa 730 kalır", () => {
    const { shell } = MENTIONS_METRICS;
    const leftColumns = HOME_METRICS.rail.width + HOME_METRICS.panel.width + shell.railWidth;

    assert.equal(leftColumns, 630);
    assert.equal(HOME_METRICS.shell.minWidth - leftColumns, shell.feedMinWidth);
  });

  it("bağlam paneli açıkken akış 404'e iner", () => {
    const { shell } = MENTIONS_METRICS;

    assert.equal(shell.feedMinWidth - shell.contextPanelWidth, shell.feedMinWidthWithPanel);
  });

  it("kırılım eşikleri asgari kabuğun altındadır", () => {
    const { shell } = MENTIONS_METRICS;

    assert.ok(shell.contextPanelOverlayBelow < HOME_METRICS.shell.minWidth);
    assert.ok(shell.railDrawerBelow < shell.contextPanelOverlayBelow);
    assert.equal(shell.contextPanelOverlayBelow, 1100);
    assert.equal(shell.railDrawerBelow, 960);
  });

  it("yoğunluk değişkenleri SPEC §1 tablosunu taşır", () => {
    assert.deepEqual(MENTIONS_DENSITY.compact, { pad: 5, gap: 11 });
    assert.deepEqual(MENTIONS_DENSITY.comfortable, { pad: 10, gap: 20 });
  });
});

describe("mentions metrics — SPEC §3 bahsetme rayı", () => {
  it("başlık ve sayaç ölçüleri", () => {
    const { sidebar } = MENTIONS_METRICS;

    assert.equal(sidebar.titleFontSize, 22);
    assert.equal(sidebar.titleWeight, 700);
    assert.equal(sidebar.badgeMinWidth, 22);
    assert.equal(sidebar.badgeHeight, 20);
    assert.equal(sidebar.badgeRadius, 7);
  });

  it("aksiyon satırı ve arama tek yükseklikte", () => {
    const { sidebar } = MENTIONS_METRICS;

    assert.equal(sidebar.markAllHeight, 36);
    assert.equal(sidebar.bellSize, 36);
    assert.equal(sidebar.searchHeight, 36);
    assert.equal(sidebar.markAllRadius, sidebar.bellRadius);
    assert.equal(sidebar.searchRadius, 11);
  });

  it("tür ve kaynak satırı ölçüleri", () => {
    const { sidebar } = MENTIONS_METRICS;

    assert.equal(sidebar.kindRowPaddingY, 9);
    assert.equal(sidebar.sourceRowPaddingY, 8);
    assert.equal(sidebar.kindRowRadius, sidebar.sourceRowRadius);
    assert.equal(sidebar.kindRowTileSize, sidebar.sourceRowTileSize);
    assert.equal(sidebar.sourceRowTileRadiusDm, "50%");
  });
});

describe("mentions metrics — SPEC §4/§5 akış ve kart", () => {
  it("başlık segmenti ve ikon butonları", () => {
    const { feedHeader } = MENTIONS_METRICS;

    assert.equal(feedHeader.tabHeight, 33);
    assert.equal(feedHeader.tabRadius, 10);
    assert.equal(feedHeader.segmentRadius, 13);
    assert.equal(feedHeader.iconButtonSize, 34);
    assert.equal(feedHeader.tabPillActiveAlpha, 0.22);
  });

  it("kart durum tonları opaklıktır, renk değil", () => {
    const { card } = MENTIONS_METRICS;

    assert.equal(card.readSurfaceAlpha, 0.45);
    assert.equal(card.unreadBorderAlpha, 0.32);
    assert.equal(card.readBorderAlpha, 0.5);
    assert.ok(card.hoverSurfaceAlpha > 0 && card.hoverSurfaceAlpha <= 1);
  });

  it("okunmamış şeridi 3px ve 15px içeriden", () => {
    const { card } = MENTIONS_METRICS;

    assert.equal(card.stripeWidth, 3);
    assert.equal(card.stripeInset, 15);
    assert.equal(card.stripeRadius, 4);
  });

  it("menü ilk iki kartta aşağı açılır ve aynı ofseti kullanır", () => {
    const { cardMenu } = MENTIONS_METRICS;

    assert.equal(cardMenu.downwardCardCount, 2);
    assert.equal(cardMenu.offset, 34);
    assert.equal(cardMenu.width, 218);
  });
});

describe("mentions metrics — SPEC §6/§7/§8 panel, modal, boş durum", () => {
  it("bağlam paneli 326 ve vurgulu satır tonları", () => {
    const { contextPanel, shell } = MENTIONS_METRICS;

    assert.equal(shell.contextPanelWidth, 326);
    assert.equal(contextPanel.highlightSurfaceAlpha, 0.1);
    assert.equal(contextPanel.highlightBorderAlpha, 0.3);
  });

  it("ayarlar modalı 496 ve switch 44×26", () => {
    const { settingsModal } = MENTIONS_METRICS;

    assert.equal(settingsModal.width, 496);
    assert.equal(settingsModal.radius, 22);
    assert.equal(settingsModal.switchWidth, 44);
    assert.equal(settingsModal.switchHeight, 26);
    assert.equal(settingsModal.switchKnobSize, 20);
    assert.equal(
      settingsModal.switchHeight - settingsModal.switchKnobSize,
      settingsModal.switchKnobInset * 2,
      "Knob dikeyde ortalanır: 26 = 20 + 3 + 3.",
    );
  });

  it("boş durum dairesi 78 ve metin genişliği 420", () => {
    const { emptyState } = MENTIONS_METRICS;

    assert.equal(emptyState.iconBox, 78);
    assert.equal(emptyState.iconBoxRadius, 26);
    assert.equal(emptyState.bodyMaxWidth, 420);
  });
});
