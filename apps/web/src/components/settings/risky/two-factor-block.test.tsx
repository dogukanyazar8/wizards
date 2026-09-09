import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { TwoFactorBlock, TwoFactorQr } from "@/components/settings/risky/two-factor-block";
import { formatManualEntryKey } from "@/lib/auth/two-factor";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş7 §4 — 2FA bloğu: QR **istemcide**, manuel anahtar dörtlü gruplu, kapatma reauth ister. */

const MESSAGES = getMessagesForLocale("tr");

const SOURCE = readFileSync(
  fileURLToPath(new URL("./two-factor-block.tsx", import.meta.url)),
  "utf8",
);

function render(enabled: boolean): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <TwoFactorBlock enabled={enabled} onChanged={() => {}} onClose={() => {}} />
    </LocaleProvider>,
  );
}

describe("TwoFactorQr — istemcide üretim", () => {
  it("`otpauth://` URI'sinden gerçek bir matris çiziyor", () => {
    const markup = renderToStaticMarkup(
      <TwoFactorQr
        label="QR"
        uri="otpauth://totp/Whispr:dogukan?secret=K4XP9QF27MRT1DVB&issuer=Whispr"
      />,
    );

    assert.ok(markup.includes("<svg"), "SVG çizilmeli");
    assert.ok((markup.match(/<rect/gu) ?? []).length > 100, "matris hücreleri eksik");
    assert.ok(markup.includes('role="img"'));
  });

  it("104 px kutu sözlükten geliyor", () => {
    const markup = renderToStaticMarkup(<TwoFactorQr label="QR" uri="otpauth://totp/a?secret=b" />);

    assert.ok(markup.includes(`width:${pxToRem(SETTINGS_METRICS.blocks.twoFactorQr.size)}`));
  });

  it("sunucudan resim beklenmiyor: kaynakta `qrCodeDataUrl` yok", () => {
    assert.ok(!SOURCE.includes("qrCodeDataUrl"));
    assert.ok(SOURCE.includes("beginTwoFactorSetupAction"), "URI döndüren eylem çağrılmalı");
  });
});

describe("TwoFactorBlock — kurulum", () => {
  it("anahtar gelene kadar iskelet, kopyala düğmesi kilitli", () => {
    const markup = render(false);

    assert.ok(markup.includes('aria-busy="true"'));
    assert.match(markup, /settings-two-factor-copy"[^>]*disabled/u);
  });

  it("manuel anahtar dörtlü gruplanıyor (sunucu biçimi)", () => {
    assert.equal(formatManualEntryKey("K4XP9QF27MRT1DVB"), "K4XP 9QF2 7MRT 1DVB");
  });

  it("altı haneli kod alanı ve `Doğrula ve aç` düğmesi var", () => {
    const markup = render(false);

    assert.ok(markup.includes('data-testid="settings-two-factor-setup-code"'));
    assert.ok(markup.includes("Doğrula ve aç"));
    assert.ok(markup.includes('maxLength="6"'));
  });
});

describe("TwoFactorBlock — kapatma", () => {
  it("parola **ve** canlı kod istiyor (Ş3 §4 sapma 2)", () => {
    const markup = render(true);

    assert.ok(markup.includes('data-testid="settings-two-factor-password"'));
    assert.ok(markup.includes('data-testid="settings-two-factor-code"'));
    assert.match(markup, /settings-two-factor-disable"[^>]*disabled/u);
  });

  it("kapatma düğmesi danger tonunda", () => {
    assert.ok(render(true).includes("background:hsl(var(--danger))"));
  });
});
