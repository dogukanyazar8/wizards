import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SETTING_ACTIONS_MAX, SettingActions } from "@/components/settings/rows/setting-actions";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { walkSettingsRows } from "@/lib/settings/tree";

/** Ş6 §3 — eylem düğmeleri ve "düğme kümesi yasak" kuralı (PROMPT §4). */

const { action } = SETTINGS_METRICS.controls;

function render(props: Partial<React.ComponentProps<typeof SettingActions>> = {}) {
  return renderToStaticMarkup(
    <SettingActions
      actions={[
        { kind: "primary", label: "Yeni kod üret", onClick: () => {} },
        { label: "Kodları indir", onClick: () => {} },
      ]}
      testId="act"
      {...props}
    />,
  );
}

describe("SettingActions", () => {
  it("gerçek `<button>` çiziyor", () => {
    const markup = render();

    assert.equal(markup.match(/type="button"/gu)?.length, 2);
    assert.ok(markup.includes("Yeni kod üret"));
    assert.ok(markup.includes("Kodları indir"));
  });

  it("32 px minimum yükseklik ve 10 yarıçap sözlükten geliyor", () => {
    const markup = render();

    assert.ok(markup.includes(`min-height:${pxToRem(action.height)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(action.radius)}`));
    assert.ok(markup.includes(`gap:${pxToRem(action.gap)}`));
  });

  it("ilk düğme `primary` olabilir", () => {
    assert.ok(render().includes("background:hsl(var(--primary))"));
  });

  it("`danger` düğme tehlike tonuna geçiyor", () => {
    const markup = render({
      actions: [{ kind: "danger", label: "Hesabı sil", onClick: () => {} }],
    });

    assert.ok(markup.includes(`hsl(var(--danger) / ${action.dangerSurfaceAlpha})`));
    assert.ok(markup.includes(`hsl(var(--danger) / ${action.dangerBorderAlpha})`));
  });

  it("küme satır başlığıyla adlandırılıyor, düğmeler kendi adını koruyor", () => {
    const markup = render({ labelledById: "row-label" });

    assert.ok(markup.includes('role="group"'));
    assert.ok(markup.includes('aria-labelledby="row-label"'));
    // Düğmenin kendi metni adıdır; `aria-labelledby` düğmelere inmez.
    assert.equal(markup.match(/aria-labelledby/gu)?.length, 1);
  });

  it("açıklama yalnız ilk düğmeye bağlanıyor", () => {
    const markup = render({ describedById: "row-desc" });

    assert.equal(markup.match(/aria-describedby="row-desc"/gu)?.length, 1);
  });
});

describe("SettingActions — düğme kümesi yasağı", () => {
  it("sınır üç düğme", () => {
    assert.equal(SETTING_ACTIONS_MAX, 3);
  });

  it("ağaçtaki en kalabalık satır üç düğme taşıyor", () => {
    let widest = 0;

    for (const { row } of walkSettingsRows()) {
      widest = Math.max(widest, row.actions?.length ?? 0);
    }

    assert.equal(widest, SETTING_ACTIONS_MAX, "sınır içerikten geliyor, tahminden değil");
  });

  it("sınırı aşan çağrı sessizce kırpılmıyor, işaretleniyor", () => {
    const markup = render({
      actions: [
        { label: "bir", onClick: () => {} },
        { label: "iki", onClick: () => {} },
        { label: "üç", onClick: () => {} },
        { label: "dört", onClick: () => {} },
      ],
    });

    assert.ok(markup.includes('data-actions-overflow="true"'));
    assert.ok(markup.includes("dört"), "kırpma sessiz olmamalı");
  });

  it("sınır içinde işaret bırakmıyor", () => {
    assert.ok(!render().includes("data-actions-overflow"));
  });
});
