import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingNav } from "@/components/settings/rows/setting-nav";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş6 §3 — dış hedefe götüren satır (`nav`). */

const { nav } = SETTINGS_METRICS.controls;

describe("SettingNav", () => {
  it("adres varken `<a href>` çiziyor", () => {
    const markup = renderToStaticMarkup(
      <SettingNav href="https://whispr.app/gizlilik" label="Aç" testId="nav" />,
    );

    assert.ok(markup.includes('href="https://whispr.app/gizlilik"'));
    assert.ok(markup.includes('rel="noreferrer"'));
    assert.ok(markup.includes('target="_blank"'));
  });

  it("adres yokken `<button>` çiziyor — href'siz bağlantı odaklanmaz", () => {
    const markup = renderToStaticMarkup(<SettingNav label="Aç" onNavigate={() => {}} />);

    assert.ok(markup.includes('type="button"'));
    assert.ok(!markup.includes("<a "));
  });

  it("chevron ekran okuyucudan saklanıyor", () => {
    const markup = renderToStaticMarkup(<SettingNav label="Aç" />);

    assert.ok(markup.includes('aria-hidden="true"'));
  });

  it("geometri sözlükten geliyor", () => {
    const markup = renderToStaticMarkup(<SettingNav label="Aç" />);

    assert.ok(markup.includes(`height:${pxToRem(nav.height)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(nav.radius)}`));
    assert.ok(markup.includes(`gap:${pxToRem(nav.gap)}`));
  });

  it("açıklamaya bağlanıyor", () => {
    const markup = renderToStaticMarkup(<SettingNav describedById="d" label="Aç" />);

    assert.ok(markup.includes('aria-describedby="d"'));
  });
});
