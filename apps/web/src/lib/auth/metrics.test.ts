import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTH_METRICS, AUTH_MIN_TAP_TARGET, pxToEm, pxToRem } from "./metrics";

/**
 * `design_handoff/giris-kayit-paketi/SPEC.md` §1.4 şekil dili tablosu ile sözlüğün denetimi.
 *
 * Sözlük ekranların tek ölçü kaynağıdır (paket kuralı: bileşenin içinde çıplak `px` yok). Bir
 * satırın sessizce kayması tasarımı bozar ve gözle yakalanmaz; tablo burada birebir tutulur.
 */

type MetricPath = { path: string; value: number };

/** Negatif değerin meşru olduğu tek yerler: gölge yayılımı, aurora inset'i ve harf/hareket ofsetleri. */
const NEGATIVE_ALLOWED =
  /(^|\.)([a-zA-Z]*[Tt]racking|spread|inset|ringOffsetLeft|driftTranslateY)$/;

/** İlk eşitleyici çubuğunun gecikmesi sıfırdır (SPEC §2) — sıfır burada yazım hatası değil. */
const ZERO_ALLOWED = /(^|\.)barDelaysMs\[\d+\]$/;

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

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      collectNumbers(entry, path ? `${path}.${key}` : key, into);
    }
  }
}

describe("auth metrics", () => {
  it("keeps the SPEC §1.4 shape language table", () => {
    // Metin alanı — web / masaüstü / mobil köşe ve yükseklik.
    assert.equal(AUTH_METRICS.field.radius.web, 12);
    assert.equal(AUTH_METRICS.field.radius.desktop, 12);
    assert.equal(AUTH_METRICS.field.radius.mobile, 14);
    assert.equal(AUTH_METRICS.field.height.web, 46);
    assert.equal(AUTH_METRICS.field.height.mobile, 49);

    // Birincil düğme.
    assert.equal(AUTH_METRICS.button.primary.radius.web, 12);
    assert.equal(AUTH_METRICS.button.primary.height.web, 48);
    assert.equal(AUTH_METRICS.button.primary.height.desktop, 46);
    assert.equal(AUTH_METRICS.button.primary.height.mobile, 52);

    // Sağlayıcı düğmesi.
    assert.equal(AUTH_METRICS.button.provider.height.web, 44);
    assert.equal(AUTH_METRICS.button.provider.height.desktop, 42);
    assert.equal(AUTH_METRICS.button.provider.height.mobile, 48);

    // Kod hücresi.
    assert.equal(AUTH_METRICS.codeCell.height, 62);
    assert.equal(AUTH_METRICS.codeCell.radius.web, 12);
    assert.equal(AUTH_METRICS.codeCell.radius.mobile, 14);

    // Onay kutusu.
    assert.equal(AUTH_METRICS.checkbox.radius, 6);
    assert.equal(AUTH_METRICS.checkbox.size.web, 18);
    assert.equal(AUTH_METRICS.checkbox.size.mobile, 20);

    // Pill / segment.
    assert.equal(AUTH_METRICS.pill.radius, 999);
    assert.equal(AUTH_METRICS.pill.height.web, 30);
    assert.equal(AUTH_METRICS.pill.height.desktop, 28);
    assert.equal(AUTH_METRICS.pill.height.mobile, 34);

    // Kart, durum kartı.
    assert.equal(AUTH_METRICS.statusCard.radius, 16);

    // Pencere köşeleri: web 14 / masaüstü 16 / telefon 44.
    assert.equal(AUTH_METRICS.window.web.radius, 14);
    assert.equal(AUTH_METRICS.window.desktop.radius, 16);
    assert.equal(AUTH_METRICS.mobile.deviceRadius, 44);
  });

  it("keeps the SPEC §2 logo geometry", () => {
    assert.equal(AUTH_METRICS.logo.size, 52);
    assert.equal(AUTH_METRICS.logo.radius, 13);
    assert.equal(AUTH_METRICS.logo.barWidth, 3);
    assert.equal(AUTH_METRICS.logo.barGap, 3);
    assert.deepEqual([...AUTH_METRICS.logo.barHeights], [17, 25, 34, 24, 18]);
    assert.deepEqual([...AUTH_METRICS.logo.barDelaysMs], [0, 130, 260, 390, 520]);
    assert.equal(AUTH_METRICS.logo.cycleMs, 2100);
    assert.deepEqual(
      { ...AUTH_METRICS.logo.scale },
      { web: 1.55, desktop: 1.2, mobileHeading: 0.95, mobileInline: 0.72 },
    );
  });

  it("keeps the SPEC §3.1 aurora layers", () => {
    assert.equal(AUTH_METRICS.aurora.web.inset, -30);
    assert.equal(AUTH_METRICS.aurora.desktop.inset, -32);
    assert.equal(AUTH_METRICS.aurora.mobile.inset, -25);
    assert.equal(AUTH_METRICS.aurora.web.durationMs, 18000);
    assert.equal(AUTH_METRICS.aurora.desktop.durationMs, 16000);
    assert.equal(AUTH_METRICS.aurora.mobile.durationMs, 16000);
    assert.equal(AUTH_METRICS.aurora.web.first.alpha, 0.22);
    assert.equal(AUTH_METRICS.aurora.web.second.alpha, 0.12);

    // SPEC §4.7 — kapanış ekranında aurora ters çevrilir.
    assert.deepEqual({ ...AUTH_METRICS.aurora.tone.successFinal }, { first: 0.18, second: 0.16 });
  });

  it("keeps the SPEC §3.3 brand panel and §5 desktop step", () => {
    assert.equal(AUTH_METRICS.brand.web.width, 512);
    assert.equal(AUTH_METRICS.brand.desktop.width, 376);
    assert.equal(AUTH_METRICS.brand.web.ring, 150);
    assert.equal(AUTH_METRICS.brand.desktop.ring, 104);
    assert.equal(AUTH_METRICS.brand.web.wordmarkSize, 42);
    assert.equal(AUTH_METRICS.brand.desktop.wordmarkSize, 32);
    assert.equal(AUTH_METRICS.brand.web.dividerMaxWidth, 300);
    assert.equal(AUTH_METRICS.brand.desktop.dividerMaxWidth, 230);

    assert.equal(AUTH_METRICS.form.web.maxWidth, 384);
    assert.equal(AUTH_METRICS.form.web.registerMaxWidth, 424);
    assert.equal(AUTH_METRICS.form.desktop.maxWidth, 352);
    assert.equal(AUTH_METRICS.form.desktop.registerMaxWidth, 392);
    assert.equal(AUTH_METRICS.window.desktop.titlebarHeight, 38);
  });

  it("keeps the mobile tap-target floor at 44 (kabul kriteri 7)", () => {
    assert.equal(AUTH_MIN_TAP_TARGET, 44);
    assert.equal(AUTH_METRICS.mobile.minTapTarget, 44);
    assert.ok(AUTH_METRICS.button.primary.height.mobile >= AUTH_MIN_TAP_TARGET);
    assert.ok(AUTH_METRICS.button.provider.height.mobile >= AUTH_MIN_TAP_TARGET);
    assert.ok(AUTH_METRICS.field.height.mobile >= AUTH_MIN_TAP_TARGET);
  });

  it("keeps every alpha inside the 0-1 range", () => {
    const numbers: MetricPath[] = [];
    collectNumbers(AUTH_METRICS, "", numbers);

    for (const { path, value } of numbers) {
      if (!/(^|\.)[a-zA-Z]*[aA]lpha$/.test(path) && !path.endsWith("Opacity")) {
        continue;
      }

      assert.ok(value >= 0 && value <= 1, `${path} bir opaklık değil: ${value}`);
    }
  });

  it("never carries a zero or accidental negative measurement", () => {
    const numbers: MetricPath[] = [];
    collectNumbers(AUTH_METRICS, "", numbers);

    assert.ok(numbers.length > 200, "Sözlük beklenenden küçük — bir dal düşmüş olabilir.");

    for (const { path, value } of numbers) {
      if (NEGATIVE_ALLOWED.test(path)) {
        continue;
      }

      if (ZERO_ALLOWED.test(path)) {
        assert.ok(value >= 0, `${path} negatif: ${value}`);
        continue;
      }

      assert.ok(value > 0, `${path} sıfır ya da negatif: ${value}`);
    }
  });

  it("carries no colour", () => {
    const serialized = JSON.stringify(AUTH_METRICS);

    assert.equal(/#[0-9a-f]{3,8}/i.test(serialized), false);
    assert.equal(/rgba?\(/i.test(serialized), false);
    assert.equal(/hsla?\(/i.test(serialized), false);
  });

  it("re-exports the shared scale helpers", () => {
    assert.equal(pxToRem(16), "1rem");
    assert.equal(pxToEm(18, 14.5), "1.241379em");
  });
});
