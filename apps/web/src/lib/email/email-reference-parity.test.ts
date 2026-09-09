import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

process.env.APP_URL = "https://whispr.app";

const { renderVerificationCodeEmail } =
  await import("@/lib/email/templates/verification-code-email");
const { renderPasswordResetEmail } = await import("@/lib/email/templates/password-reset-email");

/**
 * Birebirlik kapısı.
 *
 * Teslim paketindeki `html/*.html` dosyaları çıktının kendisidir; bu test üretilen HTML'in
 * **yapı imzasını** referansla karşılaştırır. İmza yalnız düzeni taşır: etiket adı ve görünüşü
 * belirleyen öznitelikler (`bgcolor`, `width`, `height`, `align`, `valign`, `class`, `style`).
 *
 * Normalizasyonlar:
 * - `href` imzaya girmez — paket kararı K1 gereği adresler ürün rotalarına bakıyor, SPEC'teki
 *   Türkçe yollara değil.
 * - Metin düğümleri imzaya girmez; metinler kendi testlerinde birebir denetlenir.
 * - Stil kuralları sıralanır: kural sırası görünümü değiştirmez.
 */

const REFERENCE_DIR = path.join(
  process.cwd(),
  "..",
  "..",
  "design_handoff",
  "eposta-handoff",
  "html",
);

const SIGNIFICANT_ATTRIBUTES = ["bgcolor", "width", "height", "align", "valign", "class"] as const;

function normalizeStyle(style: string) {
  return style
    .split(";")
    .map((rule) =>
      rule
        .trim()
        .replace(/\s*:\s*/, ":")
        .replace(/\s+/g, " "),
    )
    .filter(Boolean)
    .sort()
    .join(";");
}

function signature(html: string) {
  const tags: string[] = [];
  const tagPattern = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\/?>/g;

  for (const match of html.matchAll(tagPattern)) {
    const [, tagName, rawAttributes = ""] = match;
    const parts: string[] = [];

    for (const name of SIGNIFICANT_ATTRIBUTES) {
      const attribute = new RegExp(`\\s${name}="([^"]*)"`, "i").exec(rawAttributes);
      if (attribute) {
        parts.push(`${name}=${attribute[1]}`);
      }
    }

    const style = /\sstyle="([^"]*)"/i.exec(rawAttributes);
    if (style?.[1]) {
      parts.push(`style=${normalizeStyle(style[1])}`);
    }

    tags.push(`${tagName?.toLowerCase()}{${parts.join("|")}}`);
  }

  return tags;
}

function firstDifference(actual: readonly string[], expected: readonly string[]) {
  const length = Math.max(actual.length, expected.length);

  for (let index = 0; index < length; index += 1) {
    if (actual[index] !== expected[index]) {
      return [
        `İlk fark ${index}. etikette:`,
        `  üretilen: ${actual[index] ?? "(yok)"}`,
        `  referans: ${expected[index] ?? "(yok)"}`,
      ].join("\n");
    }
  }

  return "fark yok";
}

describe("e-posta referans paritesi", () => {
  it("doğrulama kodu şablonu referans uygulamayla aynı yapıyı üretir", () => {
    const reference = readFileSync(path.join(REFERENCE_DIR, "dogrulama-kodu.html"), "utf8");
    const rendered = renderVerificationCodeEmail({
      code: "482915",
      codeTtlMinutes: 10,
      locale: "tr",
      name: "Ada",
      verificationUrl: "https://whispr.app/verify-email?token=ornek-token",
    });

    const actual = signature(rendered.html);
    const expected = signature(reference);

    assert.ok(expected.length > 60, `referans imzası beklenmedik biçimde kısa: ${expected.length}`);
    assert.equal(actual.length, expected.length, firstDifference(actual, expected));
    assert.deepEqual(actual, expected, firstDifference(actual, expected));
  });

  it("şifre sıfırlama şablonu referans uygulamayla aynı yapıyı üretir", () => {
    const reference = readFileSync(path.join(REFERENCE_DIR, "sifre-sifirlama.html"), "utf8");
    const rendered = renderPasswordResetEmail({
      accountEmail: "ada@whispr.app",
      locale: "tr",
      name: "Ada",
      requestContext: {
        deviceLine: "Chrome · macOS · İstanbul, TR",
        requestedAtLabel: "27 Ağustos 2026, 14:32 (GMT+3)",
      },
      resetUrl: "https://whispr.app/reset-password?token=ornek-token",
      ttlMinutes: 30,
    });

    const actual = signature(rendered.html);
    const expected = signature(reference);

    assert.ok(expected.length > 60, `referans imzası beklenmedik biçimde kısa: ${expected.length}`);
    assert.equal(actual.length, expected.length, firstDifference(actual, expected));
    assert.deepEqual(actual, expected, firstDifference(actual, expected));
  });
});
