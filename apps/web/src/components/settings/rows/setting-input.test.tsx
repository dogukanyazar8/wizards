import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingInput } from "@/components/settings/rows/setting-input";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş6 §3 — metin alanı ve `@` öneki. */

const { input } = SETTINGS_METRICS.controls;

function render(props: Partial<React.ComponentProps<typeof SettingInput>> = {}) {
  return renderToStaticMarkup(
    <SettingInput onChange={() => {}} testId="inp" value="dogukan" {...props} />,
  );
}

describe("SettingInput", () => {
  it("gerçek `<input>` çiziyor", () => {
    const markup = render();

    assert.ok(markup.includes("<input"));
    assert.ok(markup.includes('type="text"'));
  });

  it("260 px ve 10 yarıçap sözlükten geliyor", () => {
    const markup = render();

    assert.ok(markup.includes(`width:${pxToRem(input.width)}`));
    assert.ok(markup.includes(`border-radius:${pxToRem(input.radius)}`));
  });

  it("etiket ve açıklamaya bağlanıyor", () => {
    const markup = render({ describedById: "d", labelledById: "l" });

    assert.ok(markup.includes('aria-labelledby="l"'));
    assert.ok(markup.includes('aria-describedby="d"'));
  });
});

describe("SettingInput — önek", () => {
  it("`@` çiziliyor ama değere dahil değil", () => {
    const markup = render({ prefix: "@" });

    assert.ok(markup.includes(">@<"));
    // `pu` anahtarı `dogukan` yazar, `@dogukan` değil.
    assert.ok(markup.includes('value="dogukan"'));
    assert.ok(!markup.includes('value="@dogukan"'));
  });

  it("önek ekran okuyucudan saklanıyor", () => {
    const markup = render({ prefix: "@" });
    const prefixIndex = markup.indexOf(">@<");
    const hiddenIndex = markup.lastIndexOf('aria-hidden="true"', prefixIndex);

    assert.ok(hiddenIndex >= 0 && prefixIndex - hiddenIndex < 200);
  });

  it("öneksiz satırda hiç çizilmiyor", () => {
    assert.ok(!render().includes('aria-hidden="true"'));
  });

  it("önek dolgusu sözlükten geliyor", () => {
    assert.ok(render({ prefix: "@" }).includes(`padding-left:${pxToRem(input.prefixPaddingLeft)}`));
  });
});

describe("SettingInput — devre dışı", () => {
  it("30 günlük bekleme gibi durumlarda alan kilitleniyor", () => {
    const markup = render({ disabled: true });

    assert.ok(markup.includes("disabled"));
    assert.ok(markup.includes("opacity:0.55"));
  });
});
