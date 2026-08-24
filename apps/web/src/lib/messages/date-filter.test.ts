import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDateFilterLabel, isValidDateInput, toDateFilterRange } from "./date-filter";

describe("isValidDateInput", () => {
  it("gerçek bir günü kabul eder", () => {
    assert.equal(isValidDateInput("2026-08-20"), true);
  });

  /** `2026-02-31` deseni geçer ama gerçek bir gün değil; JS onu 3 Mart'a taşır. */
  it("var olmayan günü reddeder", () => {
    assert.equal(isValidDateInput("2026-02-31"), false);
  });

  it("biçimi tutmayanı reddeder", () => {
    assert.equal(isValidDateInput("20.08.2026"), false);
    assert.equal(isValidDateInput(""), false);
  });
});

describe("toDateFilterRange", () => {
  /**
   * Tek günlük seçim aralığın tamamını kapsamalı; iki tarafı gece yarısına
   * sabitlemek sıfır uzunlukta bir aralık verir ve arama hiçbir şey bulmaz.
   */
  it("tek günü ertesi günün başına kadar genişletir", () => {
    assert.deepEqual(toDateFilterRange({ from: "2026-08-10", to: "2026-08-10" }), {
      from: "2026-08-10T00:00:00.000Z",
      to: "2026-08-11T00:00:00.000Z",
    });
  });

  it("çok günlü aralığı kapsar", () => {
    assert.deepEqual(toDateFilterRange({ from: "2026-08-01", to: "2026-08-03" }), {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-04T00:00:00.000Z",
    });
  });

  it("ters aralık null", () => {
    assert.equal(toDateFilterRange({ from: "2026-08-10", to: "2026-08-01" }), null);
  });

  it("eksik uçta null", () => {
    assert.equal(toDateFilterRange({ from: "2026-08-10", to: "" }), null);
  });

  /** Ay sonu taşması: 31 Ağustos + 1 gün 1 Eylül olmalı, 32 Ağustos değil. */
  it("ay sonunda doğru taşar", () => {
    assert.deepEqual(
      toDateFilterRange({ from: "2026-08-31", to: "2026-08-31" })?.to,
      "2026-09-01T00:00:00.000Z",
    );
  });
});

describe("formatDateFilterLabel", () => {
  it("aynı günde tek tarih yazar", () => {
    const label = formatDateFilterLabel({ from: "2026-08-10", to: "2026-08-10" }, "tr");

    assert.ok(!label.includes("–"), label);
  });

  it("farklı günlerde iki tarih yazar", () => {
    const label = formatDateFilterLabel({ from: "2026-08-10", to: "2026-08-12" }, "tr");

    assert.ok(label.includes("–"), label);
  });
});
