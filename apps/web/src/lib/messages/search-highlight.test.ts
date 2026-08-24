import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeMatchRanges, toHighlightSegments } from "./search-highlight";

describe("normalizeMatchRanges", () => {
  it("sıralar ve çakışanları birleştirir", () => {
    assert.deepEqual(
      normalizeMatchRanges(
        [
          [5, 8],
          [0, 3],
          [2, 6],
        ],
        20,
      ),
      [[0, 8]],
    );
  });

  it("metin sınırına kırpar", () => {
    assert.deepEqual(normalizeMatchRanges([[3, 99]], 6), [[3, 6]]);
  });

  it("boş ve ters aralıkları düşürür", () => {
    assert.deepEqual(
      normalizeMatchRanges(
        [
          [4, 4],
          [7, 5],
        ],
        10,
      ),
      [],
    );
  });
});

describe("toHighlightSegments", () => {
  it("vurgulu ve vurgusuz parçaları sırayla verir", () => {
    const segments = toHighlightSegments("bugun toplanti var", [[6, 14]]);

    assert.deepEqual(segments, [
      { highlighted: false, text: "bugun " },
      { highlighted: true, text: "toplanti" },
      { highlighted: false, text: " var" },
    ]);
  });

  /**
   * `ğ` ve `ı` UTF-16'da tek kod birimi ama emoji iki; aralık kod noktası
   * cinsinden geldiği için metin de kod noktası olarak dilimlenmeli.
   */
  it("çok baytlı karakterlerde aralık kaymaz", () => {
    const text = "🎉 yoğunluğu ölçtük";
    const points = Array.from(text);
    const start = points.indexOf("y");
    const end = start + Array.from("yoğunluğu").length;

    const segments = toHighlightSegments(text, [[start, end]]);
    const highlighted = segments.find((segment) => segment.highlighted);

    assert.equal(highlighted?.text, "yoğunluğu");
  });

  it("hiçbir karakter düşmez", () => {
    const text = "kısa bir cümle";
    const segments = toHighlightSegments(text, [
      [0, 4],
      [9, 14],
    ]);

    assert.equal(segments.map((segment) => segment.text).join(""), text);
  });

  it("aralık yoksa tek vurgusuz parça", () => {
    assert.deepEqual(toHighlightSegments("merhaba", []), [{ highlighted: false, text: "merhaba" }]);
  });

  it("boş metin boş dizi verir", () => {
    assert.deepEqual(toHighlightSegments("", []), []);
  });

  it("baştan başlayan eşleşmede önce boş parça üretmez", () => {
    assert.deepEqual(toHighlightSegments("abc", [[0, 2]]), [
      { highlighted: true, text: "ab" },
      { highlighted: false, text: "c" },
    ]);
  });
});
