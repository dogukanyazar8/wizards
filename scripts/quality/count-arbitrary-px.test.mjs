import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARBITRARY_PX_BASELINE,
  ARBITRARY_PX_ROOTS,
  countArbitraryPx,
  summarizeArbitraryPx,
} from "./count-arbitrary-px.mjs";

describe("arbitrary px sayacı — kaynak tarama", () => {
  it("çıplak px arbitrary değerlerini sayar", () => {
    assert.deepEqual(countArbitraryPx('<div className="w-[272px] text-[13px]" />'), {
      negatives: 0,
      values: 2,
    });
    assert.deepEqual(countArbitraryPx('className="h-[10.5px]"'), { negatives: 0, values: 1 });
  });

  it("ölçeklenebilir birimlere ve hairline ifadesine dokunmaz", () => {
    assert.deepEqual(countArbitraryPx('className="w-[17rem] gap-[0.8125rem]"'), {
      negatives: 0,
      values: 0,
    });
    assert.deepEqual(countArbitraryPx('className="border-[max(1px,0.0625rem)]"'), {
      negatives: 0,
      values: 0,
    });
    assert.deepEqual(countArbitraryPx('className="h-[100dvh] w-[100vw] basis-[50%]"'), {
      negatives: 0,
      values: 0,
    });
  });

  it("negatif değerleri ayrı kolonda tutar — taban onları saymıyordu", () => {
    assert.deepEqual(countArbitraryPx('className="-mt-[4px] top-[-2px]"'), {
      negatives: 1,
      values: 1,
    });
  });

  it("aynı satırdaki her değeri ayrı sayar", () => {
    assert.deepEqual(countArbitraryPx('"p-[8px] pt-[16px] pb-[18px]"'), {
      negatives: 0,
      values: 3,
    });
  });
});

describe("arbitrary px sayacı — repo taraması", () => {
  it("Faz 0 tabanını sabitler", () => {
    assert.deepEqual(ARBITRARY_PX_BASELINE, { files: 120, values: 1208 });
  });

  it("Tailwind tüketen tüm kaynak ağaçlarını tarar", () => {
    assert.ok(ARBITRARY_PX_ROOTS.includes("apps/web/src"));
    assert.ok(ARBITRARY_PX_ROOTS.includes("packages/ui/src"));
  });

  it("sayı tabandan yukarı çıkmaz — göç faz faz, monoton azalır", () => {
    const summary = summarizeArbitraryPx();

    assert.ok(
      summary.values <= ARBITRARY_PX_BASELINE.values,
      `arbitrary px değeri tabandan yukarı çıktı: ${summary.values} > ${ARBITRARY_PX_BASELINE.values}`,
    );
    assert.ok(
      summary.files <= ARBITRARY_PX_BASELINE.files,
      `arbitrary px dosyası tabandan yukarı çıktı: ${summary.files} > ${ARBITRARY_PX_BASELINE.files}`,
    );
  });

  it("dosya dökümü sayıyla tutarlıdır", () => {
    const summary = summarizeArbitraryPx();
    const total = summary.perFile.reduce((sum, entry) => sum + entry.values, 0);

    assert.equal(total, summary.values);
    assert.equal(summary.perFile.length, summary.files);
    assert.ok(summary.perFile.every((entry) => entry.values > 0));
  });
});
