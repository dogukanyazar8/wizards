import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { SettingTextarea } from "@/components/settings/rows/setting-textarea";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";

/** Ş6 §3 — çok satırlı alan ve sayaç. */

const { textarea } = SETTINGS_METRICS.controls;

function render(props: Partial<React.ComponentProps<typeof SettingTextarea>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SettingTextarea
        maxLength={190}
        onChange={() => {}}
        testId="txt"
        value={"x".repeat(75)}
        {...props}
      />
    </LocaleProvider>,
  );
}

describe("SettingTextarea", () => {
  it("tam genişlik ve üç satır", () => {
    const markup = render();

    assert.ok(markup.includes('rows="3"'));
    assert.equal(textarea.rows, 3);
    assert.ok(markup.includes("w-full"));
  });

  it("sayaç `75 / 190` biçiminde", () => {
    assert.ok(render().includes("75 / 190"));
  });

  it('sayaç `aria-live="polite"`', () => {
    assert.ok(render().includes('aria-live="polite"'));
  });

  it("sınır içinde `aria-invalid` yok", () => {
    assert.ok(!render().includes("aria-invalid"));
  });

  it("sınır aşıldığında `aria-invalid` ve tehlike kenarı", () => {
    const markup = render({ value: "x".repeat(191) });

    assert.ok(markup.includes('aria-invalid="true"'));
    assert.ok(markup.includes("hsl(var(--danger))"));
    assert.ok(markup.includes("191 / 190"));
  });

  it("`maxLength` niteliği verilmiyor — tarayıcı sessizce kesmesin", () => {
    assert.ok(!render().includes("maxlength"));
  });

  it("geometri sözlükten geliyor", () => {
    const markup = render();

    assert.ok(markup.includes(`border-radius:${pxToRem(textarea.radius)}`));
    assert.ok(markup.includes(`margin-top:${pxToRem(textarea.marginTop)}`));
  });
});
