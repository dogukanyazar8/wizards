import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_METRICS } from "@/lib/home/metrics";
import {
  MESSAGES_METRICS,
  NAV_PANEL_NARROWING,
  SPEC_DEVIATIONS,
  hairline,
  pxToEm,
  pxToRem,
} from "./metrics";

/**
 * Gölge geometrisinde `offsetY` pozitif, `spread` negatiftir ve `alpha` bir kesirdir. Sözlüğün
 * geri kalanında sıfır ya da negatif bir ölçü yazım hatasıdır — bu iki dal onun istisnası.
 */
const SIGNED_ROOTS = new Set(["shadow"]);
const SIGNED_LEAVES = new Set([
  "hoverBarOffsetTop",
  "resultHoverLift",
  "rowPresenceDotOffset",
  "presenceDotOffset",
]);

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

describe("messages metrics — dönüşümler", () => {
  it("tasarım pikselini rem'e çevirir", () => {
    assert.equal(pxToRem(276), "17.25rem");
    assert.equal(pxToRem(340), "21.25rem");
    assert.equal(pxToRem(228), "14.25rem");
    assert.equal(pxToRem(13.5), "0.84375rem");
  });

  it("ikon boyutunu satırın font boyutuna göre em'e çevirir", () => {
    // 17px ikon, 14.5px'lik bir satırda: 17/14.5 ≈ 1.172414em.
    assert.equal(pxToEm(17, 14.5), "1.172414em");
    assert.equal(pxToEm(16), "1em");
  });

  it("hairline fiziksel tabanı korur", () => {
    assert.equal(hairline(), "max(1px, 0.0625rem)");
  });
});

describe("messages metrics — sözlük sözleşmesi", () => {
  it("renk taşımaz", () => {
    const strings: { path: string; value: string }[] = [];
    collectStrings(MESSAGES_METRICS, "", strings);

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
    collectNumbers(MESSAGES_METRICS, "", numbers);

    const invalid = numbers.filter(({ path, value }) => {
      const [root] = path.split(".");
      const leaf = path.split(".").at(-1) ?? "";

      if (SIGNED_ROOTS.has(root ?? "") || SIGNED_LEAVES.has(leaf)) {
        return !Number.isFinite(value);
      }

      return !Number.isFinite(value) || value <= 0;
    });

    assert.deepEqual(
      invalid.map(({ path, value }) => `${path}=${value}`),
      [],
    );
  });

  it("kolon genişlikleri asgari kabukta toplamı taşırmaz", () => {
    const { layout } = MESSAGES_METRICS;
    const leftColumns = HOME_METRICS.rail.width + HOME_METRICS.panel.width + layout.railWidth;

    // SPEC §1.2: 74 + 228 + 276 = 578 sabit; 1360'ta ana alana 782 kalır.
    assert.equal(leftColumns, 578);
    assert.equal(HOME_METRICS.shell.minWidth - leftColumns, layout.mainMinWidth);
    assert.equal(layout.mainMinWidth - layout.sidePanelWidth, layout.mainMinWidthWithPanel);
  });

  it("ray ve sağ panel genişliği düzen sözlüğüyle aynı sayıdır", () => {
    assert.equal(MESSAGES_METRICS.rail.width, MESSAGES_METRICS.layout.railWidth);
    assert.equal(MESSAGES_METRICS.sidePanel.width, MESSAGES_METRICS.layout.sidePanelWidth);
  });

  it("kırılım eşikleri asgari kabuğun altındadır", () => {
    const { layout } = MESSAGES_METRICS;
    assert.ok(layout.sidePanelOverlayBelow < HOME_METRICS.shell.minWidth);
    assert.ok(layout.railDrawerBelow < layout.sidePanelOverlayBelow);
  });
});

function readMetricPath(path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      MESSAGES_METRICS,
    );
}

describe("messages metrics — SPEC sapma kaydı", () => {
  it("her sapma gerçekten bir sapmadır", () => {
    assert.ok(SPEC_DEVIATIONS.length > 0);

    for (const deviation of SPEC_DEVIATIONS) {
      assert.notEqual(deviation.html, deviation.spec, `${deviation.field} sapma değil`);
    }
  });

  /**
   * Kaydın asıl işi bu: biri sözlüğü "SPEC'e uydurmak" için değiştirirse test kırılır ve
   * otoritenin HTML olduğunu hatırlatır. Kayıt böylece belge değil, **koruma** olur.
   */
  it("sözlük her sapan alanda HTML değerini taşır", () => {
    for (const deviation of SPEC_DEVIATIONS) {
      const actual = readMetricPath(deviation.field);

      assert.notEqual(actual, undefined, `${deviation.field} sözlükte yok`);
      assert.equal(
        actual,
        deviation.html,
        `${deviation.field} HTML değerinden (${deviation.html}) saptı`,
      );
    }
  });

  it("aynı alan iki kez kaydedilmez", () => {
    const fields = SPEC_DEVIATIONS.map((deviation) => deviation.field);
    assert.equal(new Set(fields).size, fields.length);
  });
});

describe("gezinme paneli daralması (karar #2)", () => {
  it("HOME_METRICS.panel daraltılmış değerleri taşır", () => {
    assert.equal(HOME_METRICS.panel.width, NAV_PANEL_NARROWING.width.to);
    assert.equal(HOME_METRICS.panel.headerPaddingX, NAV_PANEL_NARROWING.headerPaddingX.to);
    assert.equal(HOME_METRICS.panel.navPaddingX, NAV_PANEL_NARROWING.navPaddingX.to);
    assert.equal(HOME_METRICS.panel.rowPaddingX, NAV_PANEL_NARROWING.rowPaddingX.to);
    assert.equal(HOME_METRICS.panel.sectionPaddingX, NAV_PANEL_NARROWING.sectionPaddingX.to);
    assert.equal(HOME_METRICS.panel.serverListPaddingX, NAV_PANEL_NARROWING.serverListPaddingX.to);
    assert.equal(HOME_METRICS.panel.serverRowPaddingX, NAV_PANEL_NARROWING.serverRowPaddingX.to);
    assert.equal(HOME_METRICS.panel.serverNameFontSize, NAV_PANEL_NARROWING.serverNameFontSize.to);
  });

  it("etkinlik ekranının gün paneli nav paneline bağlı kalır", () => {
    // Bağ bilerek kurulmuştu ("ikinci bir genişlik uydurulmadı"); daralma onu da kapsar.
    assert.equal(HOME_METRICS.sideScreens.dayPanelWidth, HOME_METRICS.panel.width);
  });
});
