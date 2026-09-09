import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  SettingRiskyBlockBody,
  SettingRiskyBlockTrigger,
  settingRiskyPanelId,
} from "@/components/settings/rows/setting-risky-block";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş6 §3 — riskli akışın satır içi bloğu (PROMPT §6, tuzak #12). */

const { riskyBlock } = SETTINGS_METRICS;

function renderTrigger(props: Partial<React.ComponentProps<typeof SettingRiskyBlockTrigger>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SettingRiskyBlockTrigger
        blockKey="password"
        onOpenChange={() => {}}
        open={false}
        rowKey="apw"
        testId="risky"
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("SettingRiskyBlockTrigger", () => {
  it("kapalıyken açma etiketini gösteriyor", () => {
    assert.ok(renderTrigger().includes("Parolayı değiştir"));
    assert.ok(renderTrigger({ blockKey: "twoFactor", rowKey: "s1" }).includes("Kur"));
    assert.ok(renderTrigger({ blockKey: "deleteAccount", rowKey: "d3" }).includes("Hesabı sil"));
  });

  it("açıkken `Kapat` gösteriyor", () => {
    assert.ok(renderTrigger({ open: true }).includes("Kapat"));
  });

  it("Ş7 durum bilen etiketi geçebiliyor", () => {
    assert.ok(
      renderTrigger({ blockKey: "twoFactor", openLabel: "Kapat", rowKey: "s1" }).includes("Kapat"),
    );
  });

  it("`aria-expanded` düğmenin üzerinde", () => {
    const closed = renderTrigger();
    const open = renderTrigger({ open: true });

    assert.match(closed, /<button[^>]*aria-expanded="false"/u);
    assert.match(open, /<button[^>]*aria-expanded="true"/u);
  });

  it("açıkken `aria-controls` gövdeyi gösteriyor", () => {
    const markup = renderTrigger({ open: true });

    assert.ok(markup.includes(`aria-controls="${settingRiskyPanelId("apw")}"`));
  });

  it("kapalıyken `aria-controls` yok — gösterilecek gövde de yok", () => {
    assert.ok(!renderTrigger().includes("aria-controls"));
  });

  it("hesap silme tetikleyicisi tehlike tonunda, kalanlar birincil", () => {
    assert.ok(
      renderTrigger({ blockKey: "deleteAccount", rowKey: "d3" }).includes("hsl(var(--danger)"),
    );
    assert.ok(renderTrigger().includes("background:hsl(var(--primary))"));
  });

  it("açıkken tetikleyici nötrleşiyor — açık blokta kırmızı düğme silmeyi vaat ederdi", () => {
    assert.ok(
      !renderTrigger({ blockKey: "deleteAccount", open: true, rowKey: "d3" }).includes(
        "hsl(var(--danger) / 0.12)",
      ),
    );
  });
});

describe("SettingRiskyBlockBody", () => {
  it("kimliği tetikleyicinin gösterdiği kimlikle aynı", () => {
    const markup = renderToStaticMarkup(
      <SettingRiskyBlockBody rowKey="apw">
        <div>gövde</div>
      </SettingRiskyBlockBody>,
    );

    assert.ok(markup.includes(`id="${settingRiskyPanelId("apw")}"`));
    assert.ok(markup.includes("gövde"));
  });

  it("üst kenar ve boşluk sözlükten geliyor", () => {
    const markup = renderToStaticMarkup(
      <SettingRiskyBlockBody rowKey="apw">
        <div />
      </SettingRiskyBlockBody>,
    );

    assert.ok(markup.includes(`margin-top:${pxToRem(riskyBlock.marginTop)}`));
    assert.ok(markup.includes(`padding-top:${pxToRem(riskyBlock.paddingTop)}`));
    assert.ok(markup.includes(`hsl(var(--border) / ${riskyBlock.borderTopAlpha})`));
  });
});
