import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import MainLoading from "./(main)/loading";

describe("main route loading boundary", () => {
  it("keeps the application shell visible without replaying the startup screen", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <MainLoading />
      </LocaleProvider>,
    );

    assert.match(markup, /data-testid="main-route-loading"/u);
    assert.match(markup, /aria-busy="true"/u);
    assert.doesNotMatch(markup, /data-testid="app-startup-screen"/u);
  });
});
