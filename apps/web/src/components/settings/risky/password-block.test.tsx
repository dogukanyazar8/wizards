import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { PasswordBlock } from "@/components/settings/risky/password-block";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş7 §2 — parola bloğu: iki kolon, birebir yardım metni, üç hata dalı. */

const MESSAGES: Record<string, string> = getMessagesForLocale("tr");

const SOURCE = readFileSync(
  fileURLToPath(new URL("./password-block.tsx", import.meta.url)),
  "utf8",
);

function render(): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <PasswordBlock onClose={() => {}} />
    </LocaleProvider>,
  );
}

describe("PasswordBlock — biçim", () => {
  it("mevcut parola tam genişlik, yeni parola ve tekrarı iki kolon", () => {
    const markup = render();

    assert.ok(markup.includes("grid-template-columns:1fr 1fr"));
    assert.ok(markup.includes("grid-column:1 / -1"));
    assert.ok(markup.includes('data-testid="settings-password-current"'));
    assert.ok(markup.includes('data-testid="settings-password-next"'));
    assert.ok(markup.includes('data-testid="settings-password-confirm"'));
  });

  it("yardım metni referansın kendisi", () => {
    assert.ok(render().includes("En az 10 karakter, bir sayı ve bir büyük harf gerekir."));
  });

  it("düğme ölçüsü sözlükten", () => {
    assert.ok(render().includes(`height:${pxToRem(SETTINGS_METRICS.riskyBlock.buttonHeight)}`));
  });

  it("boş formda `Parolayı güncelle` kilitli", () => {
    assert.match(render(), /settings-password-submit"[^>]*disabled/u);
  });
});

describe("PasswordBlock — hata dalları", () => {
  it("üç sunucu kodunun da ayrı cümlesi var", () => {
    for (const key of [
      "settings.security.password.error.invalidCurrent",
      "settings.security.password.error.mismatch",
      "settings.security.password.error.weak",
    ]) {
      assert.ok(MESSAGES[key], `${key} sözlükte yok`);
      assert.ok(SOURCE.includes(key.split(".").pop() ?? ""), `${key} bloğa bağlanmamış`);
    }
  });

  it("zayıf parola yanıtı kural listesini yazıyor (Ş3 §8.6)", () => {
    for (const rule of ["length", "digit", "uppercase", "maxLength", "reused"]) {
      assert.ok(MESSAGES[`settings.security.password.rule.${rule}`], `${rule} kuralı sözlükte yok`);
      assert.ok(SOURCE.includes(`${rule}:`), `${rule} eşlemede yok`);
    }
  });

  it("yazma yolu `security-client`'ın `changePassword`'ü; blok adres bilmiyor", () => {
    assert.ok(SOURCE.includes("changePassword"));
    assert.ok(!/["'`]\/api\//u.test(SOURCE));
  });
});
