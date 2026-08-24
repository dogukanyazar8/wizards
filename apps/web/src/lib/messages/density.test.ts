import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UI_SCALE_STEPS } from "@/lib/home/scale";
import {
  MESSAGES_DENSITY_BY_SCALE,
  selectMessageDensityVariables,
  selectMessagesDensity,
} from "./density";

describe("mesaj yoğunluk değişkenleri", () => {
  it("SPEC §1'in Kompakt / Rahat değerlerini taşır", () => {
    const compact = selectMessageDensityVariables("COMPACT");
    const comfortable = selectMessageDensityVariables("COMFORTABLE");

    assert.equal(compact.rowPaddingY, 5);
    assert.equal(compact.rowGap, 11);
    assert.equal(comfortable.rowPaddingY, 10);
    assert.equal(comfortable.rowGap, 20);
  });

  it("her yoğunlukta satır eylemleri hover'a bırakılır", () => {
    assert.equal(selectMessageDensityVariables("COMFORTABLE").rowActionsAlwaysVisible, false);
    assert.equal(selectMessageDensityVariables("COMPACT").rowActionsAlwaysVisible, false);
  });

  it("Kompakt her ölçüde Rahat'tan dar kalır", () => {
    const compact = selectMessageDensityVariables("COMPACT");
    const comfortable = selectMessageDensityVariables("COMFORTABLE");

    assert.ok(compact.rowPaddingY < comfortable.rowPaddingY);
    assert.ok(compact.rowGap < comfortable.rowGap);
  });
});

describe("ölçek adımı başına içerik yoğunluğu", () => {
  it("ölçek motorunun her adımı için bir kayıt vardır", () => {
    for (const step of UI_SCALE_STEPS) {
      assert.ok(
        MESSAGES_DENSITY_BY_SCALE[step.scale],
        `${step.attribute} adımının yoğunluk kaydı yok`,
      );
    }

    assert.equal(Object.keys(MESSAGES_DENSITY_BY_SCALE).length, UI_SCALE_STEPS.length);
  });

  it("ölçek büyüdükçe hiçbir sayı küçülmez", () => {
    const rows = UI_SCALE_STEPS.map((step) => selectMessagesDensity(step.scale));

    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]!;
      const current = rows[index]!;

      for (const key of ["friendRows", "messagePage", "railRows", "searchResults"] as const) {
        assert.ok(
          current[key] >= previous[key],
          `${key} ${UI_SCALE_STEPS[index]!.attribute} adımında küçüldü`,
        );
      }
    }
  });

  it("taban adım SPEC'in ×1 sayılarını verir", () => {
    const base = selectMessagesDensity(1);

    assert.equal(base.railRows, 9);
    assert.equal(base.friendRows, 9);
    assert.equal(base.messagePage, 30);
    assert.equal(base.searchResults, 3);
  });
});
