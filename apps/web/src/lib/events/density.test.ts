import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENTS_DENSITY_BY_SCALE, selectEventsDensity } from "@/lib/events/density";
import { EVENTS_DENSITY } from "@/lib/events/metrics";
import { UI_SCALE_STEPS } from "@/lib/home/scale";

const SCALES = UI_SCALE_STEPS.map((step) => step.scale);

describe("events density — olcek adimi basina icerik", () => {
  it("dort olcek adiminin dordunu de tanir", () => {
    for (const scale of SCALES) {
      assert.ok(selectEventsDensity(scale));
    }
  });

  it("sayilar olcu sozlugunden gelir; ikinci bir tablo bir gun ayrisirdi", () => {
    for (const scale of SCALES) {
      assert.deepEqual(selectEventsDensity(scale), {
        agendaRows: EVENTS_DENSITY[scale].agendaRows,
        goingRows: EVENTS_DENSITY[scale].goingRows,
        gridPageSize: EVENTS_DENSITY[scale].gridPageSize,
      });
    }
  });

  it("PROMPT §6 tablosu: 4/3 · 5/4 · 6/5 · 8/6", () => {
    assert.equal(selectEventsDensity(1).agendaRows, 4);
    assert.equal(selectEventsDensity(1).goingRows, 3);
    assert.equal(selectEventsDensity(1.15).agendaRows, 5);
    assert.equal(selectEventsDensity(1.15).goingRows, 4);
    assert.equal(selectEventsDensity(1.5).agendaRows, 6);
    assert.equal(selectEventsDensity(1.5).goingRows, 5);
    assert.equal(selectEventsDensity(2).agendaRows, 8);
    assert.equal(selectEventsDensity(2).goingRows, 6);
  });

  it("ekran buyudukce satir sayisi azalmaz", () => {
    const steps = [...SCALES];

    for (let index = 1; index < steps.length; index += 1) {
      const previous = selectEventsDensity(steps[index - 1]!);
      const current = selectEventsDensity(steps[index]!);

      assert.ok(current.agendaRows >= previous.agendaRows);
      assert.ok(current.goingRows >= previous.goingRows);
      assert.ok(current.gridPageSize >= previous.gridPageSize);
    }
  });

  it("sayfa tavani ekranin sorgu limitidir; istemcide ikinci bir kirpma yok", () => {
    // `Object.values` sayı benzeri anahtarları öne alır (1, 2, "1.15", "1.5"); adım sırası
    // ölçek tablosundan okunur, nesne anahtar sırasından değil.
    assert.deepEqual(
      SCALES.map((scale) => EVENTS_DENSITY_BY_SCALE[scale].gridPageSize),
      [12, 14, 18, 24],
    );
  });
});
