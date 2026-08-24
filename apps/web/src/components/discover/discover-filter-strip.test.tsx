import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DiscoverFilterStrip } from "@/components/discover/discover-filter-strip";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { DISCOVER_DEFAULT_ROUTE_STATE } from "@/lib/discover/routes";

describe("DiscoverFilterStrip", () => {
  it("yalnız aktif filtreleri tam çip butonu olarak çizer; lane çipi üretmez", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
        <DiscoverFilterStrip
          onClearCategory={() => undefined}
          onClearQuery={() => undefined}
          onClearSort={() => undefined}
          route={{
            ...DISCOVER_DEFAULT_ROUTE_STATE,
            category: "destek",
            lane: "events",
            q: "whispr",
            sort: "new",
          }}
        />
      </LocaleProvider>,
    );

    assert.match(markup, /<button(?=[^>]*aria-label="Destek filtresini kaldır")[^>]*>Destek/);
    assert.match(
      markup,
      /<button(?=[^>]*aria-label="Yeni eklenenler filtresini kaldır")[^>]*>Yeni eklenenler/,
    );
    assert.match(markup, /<button(?=[^>]*aria-label="“whispr” filtresini kaldır")[^>]*>“whispr”/);
    assert.doesNotMatch(markup, />Etkinlikler</);
    assert.match(markup, /href="\/discover"/);
  });

  it("aktif filtre yokken çizilmez", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
        <DiscoverFilterStrip
          onClearCategory={() => undefined}
          onClearQuery={() => undefined}
          onClearSort={() => undefined}
          route={DISCOVER_DEFAULT_ROUTE_STATE}
        />
      </LocaleProvider>,
    );

    assert.equal(markup, "");
  });
});
