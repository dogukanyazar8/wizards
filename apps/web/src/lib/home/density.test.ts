import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HOME_DENSITY_BY_SCALE, selectHomeDensity } from "./density";
import { UI_SCALE_STEPS } from "./scale";

/**
 * SPEC-ANA-SAYFA §8.3'ün tablosu, kaynaktan bağımsız olarak burada ikinci kez yazılır. İki kopya
 * birbirini denetler: sözlük kayarsa test kırmızıya döner, test kayarsa gözden geçirme yakalar.
 */
const SPEC_TABLE = {
  awaiting: [4, 5, 6, 7],
  friends: [6, 7, 8, 10],
  live: [2, 2, 3, 3],
  recent: [4, 5, 6, 7],
  upcoming: [3, 3, 4, 5],
} as const;

const SCALES = [1, 1.15, 1.5, 2] as const;

describe("home density — SPEC §8.3 tablosu", () => {
  it("SPEC'in beş satırını birebir taşır", () => {
    for (const [card, expected] of Object.entries(SPEC_TABLE)) {
      SCALES.forEach((scale, index) => {
        assert.equal(
          HOME_DENSITY_BY_SCALE[scale][card as keyof typeof SPEC_TABLE],
          expected[index],
          `${card} @ ×${scale}`,
        );
      });
    }
  });

  it("ölçek motorunun adımlarıyla aynı anahtarları taşır", () => {
    assert.deepEqual(
      Object.keys(HOME_DENSITY_BY_SCALE)
        .map(Number)
        .sort((left, right) => left - right),
      UI_SCALE_STEPS.map((step) => step.scale),
    );
  });

  it("hiçbir kartın satır sayısı adım büyürken azalmaz", () => {
    for (const card of Object.keys(SPEC_TABLE) as (keyof typeof SPEC_TABLE)[]) {
      for (let index = 1; index < SCALES.length; index += 1) {
        const previous = HOME_DENSITY_BY_SCALE[SCALES[index - 1]!][card];
        const current = HOME_DENSITY_BY_SCALE[SCALES[index]!][card];

        assert.ok(current >= previous, `${card}: ×${SCALES[index]} < ×${SCALES[index - 1]}`);
      }
    }
  });

  it("adımı sözlüğe çevirir", () => {
    assert.deepEqual(selectHomeDensity(1), HOME_DENSITY_BY_SCALE[1]);
    assert.deepEqual(selectHomeDensity(2), HOME_DENSITY_BY_SCALE[2]);
  });
});

describe("home density — uçlarla uyum", () => {
  /**
   * Sorgu `limit`'i doğrudan bu tablodan geliyor (05 §6). Bir satır uçların zod aralığının dışına
   * çıkarsa istek 400 döner ve kart boş kalır; sınır burada sabitlenir.
   */
  it("her satır ilgili ucun izin verdiği aralıkta kalır", () => {
    const bounds = {
      awaiting: { max: 20, min: 1 },
      live: { max: 10, min: 1 },
      recent: { max: 10, min: 4 },
      upcoming: { max: 10, min: 1 },
    } as const;

    for (const scale of SCALES) {
      for (const [card, bound] of Object.entries(bounds)) {
        const value = HOME_DENSITY_BY_SCALE[scale][card as keyof typeof bounds];

        assert.ok(value >= bound.min && value <= bound.max, `${card} @ ×${scale} = ${value}`);
      }
    }
  });
});
