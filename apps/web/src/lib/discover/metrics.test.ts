import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DISCOVER_METRICS, SPEC_DEVIATIONS, hairline, pxToEm, pxToRem } from "./metrics";

/**
 * Sözlükteki her ölçü pozitiftir; aşağıdaki yollar bunun bilinçli istisnasıdır. Gölge `spread`i
 * negatiftir, display tipografisinin `letter-spacing`i negatiftir, kart tile'ı banda **negatif
 * margin** ile oturur ve avatar yığını negatif bindirmeyle çizilir.
 */
const SIGNED_PATHS = new Set(["serverCard.tileMarginTop", "channelRow.avatarStackOverlap"]);

const SIGNED_LEAVES = new Set(["spread", "x"]);

/** `letterSpacing` ile biten her yaprak (display tipografisi `-0.02em`). */
const SIGNED_LEAF_SUFFIX = "LetterSpacing";

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

function collectStrings(
  value: unknown,
  path: string,
  into: { path: string; value: string }[],
): void {
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
  }, DISCOVER_METRICS);
}

describe("discover metrics — dönüşümler", () => {
  it("tasarım pikselini rem'e çevirir", () => {
    assert.equal(pxToRem(276), "17.25rem");
    assert.equal(pxToRem(326), "20.375rem");
    assert.equal(pxToRem(496), "31rem");
    assert.equal(pxToRem(10.5), "0.65625rem");
  });

  it("ikon boyutunu satırın font boyutuna göre em'e çevirir", () => {
    // 13px ortak-sunucu ikonu 11.5px'lik bir satırda: 13/11.5 ≈ 1.130435em.
    assert.equal(pxToEm(13, 11.5), "1.130435em");
    assert.equal(pxToEm(16), "1em");
  });

  it("hairline fiziksel tabanı korur", () => {
    assert.equal(hairline(), "max(1px, 0.0625rem)");
  });
});

describe("discover metrics — sözlük sözleşmesi", () => {
  it("renk taşımaz", () => {
    const strings: { path: string; value: string }[] = [];
    collectStrings(DISCOVER_METRICS, "", strings);

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
    collectNumbers(DISCOVER_METRICS, "", numbers);

    const invalid = numbers.filter(({ path, value }) => {
      const leaf = path.split(".").at(-1) ?? "";

      if (SIGNED_PATHS.has(path) || SIGNED_LEAVES.has(leaf) || leaf.endsWith(SIGNED_LEAF_SUFFIX)) {
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

  it("sapma kayıtları sözlükte gerçekten var olan bir yolu gösterir", () => {
    const dangling = SPEC_DEVIATIONS.filter(
      (deviation) => typeof readMetric(deviation.field) !== "number",
    );

    assert.deepEqual(
      dangling.map((deviation) => deviation.field),
      [],
    );
  });
});

describe("discover metrics — SPEC §1 kolon şeması", () => {
  it("sol üç kolon 578'dir ve akışa 782 kalır", () => {
    const { columns, shell } = DISCOVER_METRICS;

    assert.equal(columns.rail + columns.nav + columns.directory, 578);
    assert.equal(
      shell.minWidth - columns.rail - columns.nav - columns.directory,
      columns.feedWidth,
    );
  });

  it("profil paneli açıkken akış 456'ya iner", () => {
    const { columns } = DISCOVER_METRICS;

    assert.equal(columns.feedWidth - columns.panel, columns.feedWidthWithPanel);
  });

  it("panel açıkken ızgara tek kolona iner — bu kırılım değil, doğru davranış", () => {
    const { columns, serverCard } = DISCOVER_METRICS;

    // 456 px'lik akışta 24+24 px yatay padding düşünce 408 kalır; iki kolon için
    // 2×262 + 12 = 536 gerekirdi. `minmax` değeri bu yüzden değiştirilmez (Tuzak 7).
    const usable = columns.feedWidthWithPanel - DISCOVER_METRICS.feedHeader.paddingX * 2;
    assert.ok(usable < serverCard.gridMin * 2 + serverCard.gridGap);
    assert.ok(usable >= serverCard.gridMin);
  });

  it("kırılım eşikleri büyükten küçüğe sıralıdır", () => {
    const { columns } = DISCOVER_METRICS;

    assert.ok(columns.panelOverlayBelow > columns.directoryDrawerBelow);
    assert.ok(columns.directoryDrawerBelow > columns.singleColumnBelow);
  });
});

describe("discover metrics — SPEC §4.4 sunucu kartı", () => {
  it("tile banda oturur: negatif margin tile'ın yarısından küçüktür", () => {
    const { serverCard } = DISCOVER_METRICS;

    // -19, 44'lük tile'ın 19px'ini banda taşır; kalan 25px kart gövdesindedir.
    assert.equal(serverCard.tileMarginTop, -19);
    assert.ok(Math.abs(serverCard.tileMarginTop) < serverCard.tileSize);
    assert.ok(Math.abs(serverCard.tileMarginTop) < serverCard.bandHeight);
  });

  it("kart boyutu iki değer arasında geçer", () => {
    const { serverCard } = DISCOVER_METRICS;

    assert.equal(serverCard.gridMin, 262);
    assert.equal(serverCard.gridMinLarge, 330);
  });

  it("seçili şerit kartın dikey ortasında kalır", () => {
    const { serverCard } = DISCOVER_METRICS;

    assert.equal(serverCard.selectedStripeInset, 16);
    assert.equal(serverCard.selectedStripeWidth, 3);
  });
});

describe("discover metrics — SPEC §5 profil paneli", () => {
  it("profil bloğunun tile'ı halkasız ve negatif marginsizdir", () => {
    const { panel, serverCard } = DISCOVER_METRICS;

    // Kart tile'ı banda oturur (halka + negatif margin); panel tile'ı oturmaz. İki ölçünün
    // aynı sözlükte yan yana durması, panelin yanlışlıkla kartın dilini kopyalamasını önler.
    assert.equal(panel.profileTileSize, 54);
    assert.ok("tileRingWidth" in serverCard);
    assert.equal("profileTileRingWidth" in panel, false);
  });

  it("istatistik ızgarası üç kutudur", () => {
    assert.equal(DISCOVER_METRICS.panel.statGridColumns, 3);
  });
});

describe("discover metrics — SPEC §6 katıl modalı", () => {
  it("anahtar knob'u iki uçta da 3 px kenar boşluğu bırakır", () => {
    const { joinModal } = DISCOVER_METRICS;

    assert.equal(
      joinModal.toggleWidth - joinModal.toggleKnobSize - joinModal.toggleKnobInset,
      joinModal.toggleKnobOffsetOn,
    );
    assert.equal(joinModal.toggleHeight - joinModal.toggleKnobSize, joinModal.toggleKnobInset * 2);
  });

  it("modal 496 px genişliktir", () => {
    assert.equal(DISCOVER_METRICS.joinModal.width, 496);
  });
});

describe("discover metrics — süreler", () => {
  it("arama debounce'u SPEC §7 ile aynıdır", () => {
    assert.equal(DISCOVER_METRICS.transitions.searchDebounce, 250);
  });

  it("hover süresi taban süreden kısadır", () => {
    const { transitions } = DISCOVER_METRICS;

    assert.ok(transitions.hover < transitions.base);
    assert.ok(transitions.searchBorder > transitions.base);
  });
});
