import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_METRICS } from "./metrics";
import { selectUiScale, UI_SCALE_STEPS } from "./scale";

describe("ui scale steps", () => {
  it("declares the four steps of SPEC §8.1 in ascending order", () => {
    assert.deepEqual(
      UI_SCALE_STEPS.map((step) => [step.scale, step.rootFontSizePx, step.attribute]),
      [
        [1, 16, "1"],
        [1.15, 18, "1.15"],
        [1.5, 24, "1.5"],
        [2, 32, "2"],
      ],
    );
  });

  it("keeps the attribute in sync with the numeric step", () => {
    for (const step of UI_SCALE_STEPS) {
      assert.equal(step.attribute, String(step.scale));
    }
  });

  it("reads its base shell from the Faz 0 metric dictionary", () => {
    // The engine must not carry its own copy of 1360×920.
    assert.equal(HOME_METRICS.shell.minWidth, 1360);
    assert.equal(HOME_METRICS.shell.minHeight, 920);
  });
});

describe("selectUiScale — 02-faz1 §2.1 table", () => {
  const table: ReadonlyArray<{ width: number; height: number; scale: number; why: string }> = [
    { width: 1366, height: 768, scale: 1, why: "yükseklik 920'nin altında, taban" },
    { width: 1360, height: 920, scale: 1, why: "tam taban" },
    { width: 1600, height: 900, scale: 1, why: "yükseklik yetmiyor" },
    { width: 1920, height: 1080, scale: 1.15, why: "üst sınır 1080/920 = 1.17" },
    { width: 1920, height: 1200, scale: 1.15, why: "genişlik 1.41, yükseklik 1.30 → 1.15" },
    { width: 2560, height: 1440, scale: 1.5, why: "ikisi de yeter" },
    { width: 3840, height: 2160, scale: 2, why: "ikisi de yeter" },
    { width: 5120, height: 1440, scale: 1.5, why: "yükseklikten sınırlı — ×2 seçilmemeli" },
    { width: 7680, height: 4320, scale: 2, why: "üst sınır" },
    { width: 1024, height: 640, scale: 1, why: "küçük ekran; kırılımlar Faz 7" },
  ];

  for (const row of table) {
    it(`${row.width}×${row.height} → ×${row.scale} (${row.why})`, () => {
      assert.equal(selectUiScale({ height: row.height, width: row.width }).scale, row.scale);
    });
  }

  it("maps every table row to the matching root font size", () => {
    const sizes = table.map((row) => selectUiScale({ height: row.height, width: row.width }));
    assert.deepEqual(
      sizes.map((step) => step.rootFontSizePx),
      [16, 16, 16, 18, 18, 24, 32, 24, 32, 16],
    );
  });
});

describe("selectUiScale — SPEC §8.1 rules", () => {
  it("never returns a step whose fit factor was not reached", () => {
    for (let width = 1000; width <= 8000; width += 137) {
      for (let height = 600; height <= 4400; height += 91) {
        const step = selectUiScale({ height, width });
        const fit = Math.min(width / 1360, height / 920);
        assert.ok(
          step.scale <= fit || step.scale === 1,
          `${width}×${height} picked ×${step.scale} above fit ${fit}`,
        );
      }
    }
  });

  it("leaves at least 1360×920 CSS px of layout room above the base step", () => {
    for (let width = 1360; width <= 8000; width += 149) {
      for (let height = 920; height <= 4400; height += 97) {
        const step = selectUiScale({ height, width });
        if (step.scale === 1) continue;
        assert.ok(
          height / step.scale >= 920,
          `${width}×${height} → ×${step.scale} clips vertically`,
        );
        assert.ok(
          width / step.scale >= 1360,
          `${width}×${height} → ×${step.scale} clips horizontally`,
        );
      }
    }
  });

  it("picks the exact step at each shell boundary", () => {
    assert.equal(selectUiScale({ height: 1058, width: 1564 }).scale, 1.15);
    assert.equal(selectUiScale({ height: 1380, width: 2040 }).scale, 1.5);
    assert.equal(selectUiScale({ height: 1840, width: 2720 }).scale, 2);
  });

  it("stays one step below at one pixel under each boundary", () => {
    assert.equal(selectUiScale({ height: 1057, width: 1564 }).scale, 1);
    assert.equal(selectUiScale({ height: 1379, width: 2040 }).scale, 1.15);
    assert.equal(selectUiScale({ height: 1839, width: 2720 }).scale, 1.5);
  });

  it("caps at ×2 no matter how large the viewport is", () => {
    assert.equal(selectUiScale({ height: 8640, width: 15360 }).scale, 2);
    assert.equal(selectUiScale({ height: 100_000, width: 100_000 }).scale, 2);
  });

  it("stays limited by the shorter axis on ultrawide viewports", () => {
    // §6.2: width-only selection would pick ×2 here and clip the friends strip.
    assert.equal(selectUiScale({ height: 1440, width: 5120 }).scale, 1.5);
    assert.equal(selectUiScale({ height: 1080, width: 3440 }).scale, 1.15);
  });

  it("falls back to the base step for degenerate viewports", () => {
    for (const viewport of [
      { height: 0, width: 0 },
      { height: -1, width: -1 },
      { height: Number.NaN, width: 1920 },
      { height: 1080, width: Number.NaN },
      { height: Number.POSITIVE_INFINITY, width: Number.POSITIVE_INFINITY },
    ]) {
      assert.equal(selectUiScale(viewport).scale, 1);
    }
  });

  it("is pure — repeated calls return the same frozen step object", () => {
    const first = selectUiScale({ height: 1080, width: 1920 });
    const second = selectUiScale({ height: 1080, width: 1920 });
    assert.equal(first, second);
    assert.ok(Object.isFrozen(first));
  });
});
