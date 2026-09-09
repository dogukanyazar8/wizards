import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { AppIconGridBlock } from "@/components/settings/blocks/app-icon-grid-block";
import { APP_ICON_OPTIONS } from "@/lib/app-icons";
import { getMessagesForLocale } from "@/lib/locale";

/** Ş8 §B.8 — `n1`, yedi kutu; seçim gerçekten favicon'u değiştirir. */

const markup = renderToStaticMarkup(
  <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
    <AppIconGridBlock data={{}} row={{ block: "appIcons", key: "n1", type: "custom" }} />
  </LocaleProvider>,
);

describe("AppIconGridBlock", () => {
  it("yedi kutu, tasarımın sırasıyla", () => {
    assert.equal(APP_ICON_OPTIONS.length, 7);
    assert.deepEqual(
      APP_ICON_OPTIONS.map((option) => option.id),
      ["whispr", "wave-5", "wave-4", "wave-3", "wave-2", "wave-1", "wave-0"],
    );
    assert.equal((markup.match(/role="radio"/g) ?? []).length, 7);
  });

  it("etiketler tasarımdaki adlar", () => {
    for (const label of ["Whispr", "Wave 5", "Wave 4", "Wave 3", "Wave 2", "Wave 1", "Wave 0"]) {
      assert.ok(markup.includes(`>${label}<`), label);
    }
  });

  it("görseller `public/app-icons/` altından; sabit renk üretilmiyor", () => {
    for (const option of APP_ICON_OPTIONS) {
      assert.ok(option.src.startsWith("/app-icons/"), option.src);
      assert.ok(markup.includes(encodeURIComponent(option.src)) || markup.includes(option.src));
    }

    assert.doesNotMatch(markup, /rgba?\(/u);
  });

  it("seçim favicon yolunu yazan tek sahibe gidiyor", () => {
    // Blok kendi `<link rel=icon>` yazıcısını kurmaz; `AppIconProvider` tek yazıcıdır.
    const source = readFileSync(new URL("./app-icon-grid-block.tsx", import.meta.url), "utf8");

    assert.match(source, /setAppIconId/u);
    assert.doesNotMatch(source, /document\.(head|querySelector|createElement)/u);
  });
});
