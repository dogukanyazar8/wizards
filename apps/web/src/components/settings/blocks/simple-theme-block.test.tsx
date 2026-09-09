import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { SimpleThemeBlock } from "@/components/settings/blocks/simple-theme-block";
import { SIMPLE_WIZARDS_THEMES } from "@/lib/appearance";
import { getMessagesForLocale } from "@/lib/locale";

/** Ş8 §B.5 — `t1`, dört basit tema kartı (K6). */

const markup = renderToStaticMarkup(
  <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
    <SimpleThemeBlock data={{}} row={{ block: "themes", key: "t1", type: "custom" }} />
  </LocaleProvider>,
);

describe("SimpleThemeBlock", () => {
  it("dört kart, tasarımın sırasıyla", () => {
    assert.deepEqual(
      SIMPLE_WIZARDS_THEMES.map((theme) => theme.id),
      ["theme-light", "theme-ash", "theme-dark", "theme-onyx"],
    );

    for (const theme of SIMPLE_WIZARDS_THEMES) {
      assert.ok(markup.includes(`data-testid="settings-theme-${theme.id}"`), theme.id);
    }
  });

  it("adlar tasarımdaki dördü", () => {
    for (const label of ["Light", "Ash", "Dark", "Onyx"]) {
      assert.ok(markup.includes(`>${label}<`), label);
    }
  });

  it("radyo grubu erişilebilir", () => {
    assert.ok(markup.includes('role="radiogroup"'));
    assert.equal((markup.match(/role="radio"/g) ?? []).length, 4);
  });
});
