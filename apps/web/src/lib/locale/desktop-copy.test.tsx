import React from "react";
import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, useI18n } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "./messages/tr";
import { EN_MESSAGES } from "./messages/en";
function Copy() {
  const { t } = useI18n();
  return <span>{t("voice.errors.cameraDenied")}</span>;
}
it("desktop server rendering uses native guidance while web keeps browser instructions", () => {
  for (const [locale, messages] of [
    ["tr", TR_MESSAGES],
    ["en", EN_MESSAGES],
  ] as const) {
    const desktop = renderToStaticMarkup(
      <LocaleProvider initialLocale={locale} initialMessages={messages} initialDesktop>
        <Copy />
      </LocaleProvider>,
    );
    const web = renderToStaticMarkup(
      <LocaleProvider initialLocale={locale} initialMessages={messages}>
        <Copy />
      </LocaleProvider>,
    );
    assert.doesNotMatch(desktop, /tarayıcı|browser/i);
    assert.match(web, /tarayıcı|browser/i);
    for (const [key, text] of Object.entries(messages))
      if (key.endsWith(".desktop")) assert.doesNotMatch(text, /tarayıcı|browser/i);
  }
});
