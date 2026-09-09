import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { ThemeGridBlock, ThemeGridBlockBody } from "@/components/settings/blocks/theme-grid-block";
import {
  ADVANCED_WIZARDS_THEMES,
  ADVANCED_WIZARDS_THEMES_IN_DESIGN_ORDER,
  countAdvancedThemesByMode,
  WIZARDS_THEMES,
} from "@/lib/appearance";
import { getMessagesForLocale } from "@/lib/locale";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

/** Ş8 §B.5 — `t2`, 23 tema (K6 + SPEC_DEVIATIONS #1). */

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

const skeleton = render(
  <ThemeGridBlock data={{}} row={{ block: "themeGrid", key: "t2", type: "custom" }} />,
);
const body = render(<ThemeGridBlockBody rowKey="t2" />);

describe("ThemeGridBlock", () => {
  it("ağır bölüm: ilk boyada iskelet geliyor", () => {
    assert.ok(skeleton.includes('data-block-skeleton="themeGrid"'));
    assert.ok(skeleton.includes('aria-busy="true"'));
    assert.ok(!skeleton.includes('role="radio"'), "iskelette 23 swatch çizilmemeli");
  });

  it("23 tema listeleniyor ve hiçbir kimlik değişmedi", () => {
    assert.equal(ADVANCED_WIZARDS_THEMES.length, 23);
    assert.equal(WIZARDS_THEMES.length, 27);

    for (const theme of ADVANCED_WIZARDS_THEMES) {
      assert.ok(body.includes(`data-testid="settings-theme-${theme.id}"`), theme.id);
    }
  });

  it("Koyu/Açık etiketi gerçek temadan; sayım 14/9 (sapma #1)", () => {
    assert.deepEqual(countAdvancedThemesByMode(), { dark: 14, light: 9 });
    assert.equal((body.match(/data-theme-mode="dark"/g) ?? []).length, 14);
    assert.equal((body.match(/data-theme-mode="light"/g) ?? []).length, 9);
    // Blok bir **sayaç** yazmıyor, yalnız etiketliyor: sayım fonksiyonu kaynakta geçmiyor.
    const source = readFileSync(new URL("./theme-grid-block.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /countAdvancedThemesByMode/u);
  });

  it("ızgara sırası tasarımın karesiyle aynı", () => {
    const order = ADVANCED_WIZARDS_THEMES_IN_DESIGN_ORDER.map(
      (theme) => (TR_MESSAGES as Record<string, string>)[theme.displayNameKey],
    );

    assert.deepEqual(order.slice(0, 6), [
      "Gece Mavisi",
      "Kömür",
      "Mürekkep",
      "Orman",
      "Bordo",
      "Mor Alacakaranlık",
    ]);
    assert.equal(order.at(-1), "Gül");
    assert.equal(order.length, 23);

    // Sıra bir sunum kararı: küme değişmedi.
    assert.deepEqual(
      [...ADVANCED_WIZARDS_THEMES_IN_DESIGN_ORDER].map((theme) => theme.id).sort(),
      [...ADVANCED_WIZARDS_THEMES].map((theme) => theme.id).sort(),
    );
  });

  it("Türkçe adlar tasarımın listesinden ve tekil", () => {
    const designNames = [
      "Gece Mavisi",
      "Kömür",
      "Mürekkep",
      "Orman",
      "Bordo",
      "Mor Alacakaranlık",
      "Bakır",
      "Okyanus",
      "Zeytin",
      "Gece Yarısı",
      "Grafit",
      "Kobalt",
      "Kiraz",
      "Kar",
      "Kum",
      "Sisli Cam",
      "Adaçayı",
      "Şafak",
      "Buz",
      "Lavanta",
      "Kağıt",
      "Deniz Köpüğü",
      "Gül",
    ];

    const assigned = ADVANCED_WIZARDS_THEMES.map(
      (theme) => (TR_MESSAGES as Record<string, string>)[theme.displayNameKey],
    );

    assert.equal(new Set(assigned).size, 23, "iki tema aynı adı almış");
    assert.deepEqual([...assigned].sort(), [...designNames].sort());

    for (const name of designNames) {
      assert.ok(body.includes(name), name);
    }
  });
});
