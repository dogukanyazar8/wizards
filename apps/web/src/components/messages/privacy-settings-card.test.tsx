import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MESSAGING_PRIVACY_QUERY_KEY,
  PRIVACY_ROWS,
  PRIVACY_ROW_GRID_TEMPLATE,
  PrivacySettingsCard,
  privacyRowStyle,
  privacyTileTone,
} from "@/components/messages/privacy-settings-card";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";
import { settingsQueryKeys } from "@/lib/settings/client";

const { profilePanel } = MESSAGES_METRICS;

function render(overrides: Partial<React.ComponentProps<typeof PrivacySettingsCard>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <PrivacySettingsCard
        onToggle={() => undefined}
        value={{ readReceipts: true, typingIndicator: true }}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("GİZLİLİK VE GÜVENLİK — hiza (SPEC §15.5.2 kabul kriteri)", () => {
  it("üç satır da **aynı** ızgara dizesini taşır", () => {
    const markup = render();
    const template = `grid-template-columns:${PRIVACY_ROW_GRID_TEMPLATE}`;

    assert.equal(markup.split(template).length - 1, 3);
  });

  it("ızgara üç kolon: sabit ikon karosu · esneyen metin · en az anahtar genişliği", () => {
    assert.equal(
      PRIVACY_ROW_GRID_TEMPLATE,
      `${pxToRem(profilePanel.privacyTileSize)} minmax(0, 1fr) minmax(${pxToRem(
        profilePanel.switchWidth,
      )}, auto)`,
    );
    assert.equal(privacyRowStyle.display, "grid");
    assert.equal(privacyRowStyle.alignItems, "center");
  });

  it("satır yükseklikleri `privacyRowMinHeight` altına düşmez", () => {
    const markup = render();
    const minHeight = `min-height:${pxToRem(profilePanel.privacyRowMinHeight)}`;

    assert.equal(privacyRowStyle.minHeight, pxToRem(profilePanel.privacyRowMinHeight));
    assert.equal(markup.split(minHeight).length - 1, 3);
  });

  it("hiza tek bir stil kaydından gelir — satır başına elle padding yok", () => {
    const markup = render();
    const padding = `padding:${pxToRem(profilePanel.privacyRowPaddingY)} ${pxToRem(
      profilePanel.privacyRowPaddingX,
    )}`;

    assert.equal(markup.split(padding).length - 1, 3);
  });

  it("`subgrid` kullanılmıyor — browserslist Chrome 111'i destekliyor", () => {
    assert.ok(!PRIVACY_ROW_GRID_TEMPLATE.includes("subgrid"));
    assert.ok(!render().includes("subgrid"));
  });
});

describe("şifreleme satırı — karar K2", () => {
  it("metin gerçeği söyler: `Aktarımda şifreli`", () => {
    const markup = render();

    assert.ok(markup.includes("Aktarımda şifreli"));
    assert.ok(markup.includes("TLS 1.3 · sunucuda şifreli saklanır"));
    assert.ok(!markup.includes("Uçtan uca şifreli"));
    assert.ok(!markup.includes("Anahtar doğrulandı"));
  });

  it("ölçü ve renk tasarımdaki gibi kalır: yeşil zemin, yeşil karo, `Aktif` pill'i", () => {
    const markup = render();

    assert.ok(markup.includes("background:hsl(var(--success)/0.09)"));
    assert.ok(markup.includes("background:hsl(var(--success)/0.18)"));
    assert.ok(markup.includes("background:hsl(var(--success)/0.16)"));
    assert.ok(markup.includes("Aktif"));
  });

  it("salt okunur: kartta iki anahtar var, üç değil", () => {
    const markup = render();

    assert.equal(markup.match(/role="switch"/gu)?.length, 2);
    assert.ok(markup.includes('data-testid="profile-privacy-encryption-state"'));
    assert.ok(!markup.includes('data-testid="profile-privacy-toggle-encryption"'));
  });
});

describe("iki anahtar", () => {
  it("gerçek `role=switch` + doğru `aria-checked`", () => {
    const markup = render({ value: { readReceipts: true, typingIndicator: false } });

    assert.equal(markup.match(/role="switch"/gu)?.length, 2);
    assert.equal(markup.match(/aria-checked="true"/gu)?.length, 1);
    assert.equal(markup.match(/aria-checked="false"/gu)?.length, 1);
  });

  it("`aria-describedby` alt satırı gösterir", () => {
    const markup = render();

    for (const row of PRIVACY_ROWS) {
      const match = new RegExp(
        `aria-describedby="([^"]+)"[^>]*data-testid="profile-privacy-toggle-${row.key}"`,
        "u",
      ).exec(markup);

      assert.ok(match, `${row.key} için aria-describedby yok`);
      assert.ok(markup.includes(`id="${match[1]}"`), `${row.key} alt satırının kimliği yok`);
    }
  });

  it("kapatınca ikon karosu tonunu değiştirir", () => {
    const onTone = privacyTileTone(true);
    const offTone = privacyTileTone(false);

    assert.deepEqual(onTone, {
      background: "hsl(var(--primary)/0.14)",
      color: "hsl(var(--primary))",
    });
    assert.deepEqual(offTone, {
      background: "hsl(var(--surface-soft))",
      color: "hsl(var(--text-muted))",
    });

    const allOn = render();
    const allOff = render({ value: { readReceipts: false, typingIndicator: false } });

    assert.equal(allOn.split(onTone.background).length - 1, 2);
    assert.equal(allOff.split(offTone.background).length - 1, 2);
    assert.ok(!allOff.includes(onTone.background));
  });

  it("topuz 18px ve 3 → 19 arasında; ray 40×24", () => {
    const on = render();
    const off = render({ value: { readReceipts: false, typingIndicator: false } });

    assert.ok(on.includes(`left:${pxToRem(profilePanel.switchKnobOffsetOn)}`));
    assert.ok(off.includes(`left:${pxToRem(profilePanel.switchKnobOffsetOff)}`));
    assert.ok(on.includes(`width:${pxToRem(profilePanel.switchWidth)}`));
    assert.ok(on.includes(`height:${pxToRem(profilePanel.switchHeight)}`));
    assert.ok(on.includes(`width:${pxToRem(profilePanel.switchKnobSize)}`));
  });

  it("`prefers-reduced-motion` açıkken topuz geçişi kapanır", () => {
    const markup = render();

    assert.ok(markup.includes("motion-safe:transition-[left]"));
    assert.ok(!markup.includes(" transition-[left]"));
  });

  it("bekleyen yazma sırasında anahtar pasif olur, satır kaybolmaz", () => {
    const markup = render({ disabled: true });

    assert.equal(markup.match(/role="switch"/gu)?.length, 2);
    assert.equal(markup.match(/disabled=""/gu)?.length, 2);
  });
});

describe("hesap geneli tercih — Ayarlar ekranıyla ortak state", () => {
  it("anahtar `settingsQueryKeys` ile aynı kökte durur", () => {
    assert.deepEqual([...MESSAGING_PRIVACY_QUERY_KEY], ["user", "messaging-privacy"]);
    assert.equal(MESSAGING_PRIVACY_QUERY_KEY[0], settingsQueryKeys.bootstrap[0]);
    assert.equal(MESSAGING_PRIVACY_QUERY_KEY[0], settingsQueryKeys.mentions[0]);
  });

  it("anahtar sohbet kimliği taşımaz — tercih sohbet başına değil", () => {
    assert.ok(!MESSAGING_PRIVACY_QUERY_KEY.some((part) => part.includes("conversation")));
    assert.equal(MESSAGING_PRIVACY_QUERY_KEY.length, 2);
  });
});
