import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverLane } from "@wizards/types";

import { DiscoverEmptyState } from "@/components/discover/discover-empty-state";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { DISCOVER_DEFAULT_ROUTE_STATE, type DiscoverRouteState } from "@/lib/discover/routes";

function render(route: DiscoverRouteState): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DiscoverEmptyState onJoinServer={() => undefined} route={route} />
    </LocaleProvider>,
  );
}

describe("DiscoverEmptyState", () => {
  it("q doluyken referans HTML metnini ve 78px rem ikon kutusunu çizer", () => {
    const markup = render({ ...DISCOVER_DEFAULT_ROUTE_STATE, q: "sunucu adı" });

    assert.match(markup, /Sonuç bulunamadı/u);
    assert.match(
      markup,
      /“sunucu adı” için dizinde eşleşme yok\. Yazımı kontrol edebilir, kategori filtresini kaldırabilir ya da davet kodun varsa doğrudan katılabilirsin\./u,
    );
    assert.match(markup, /height:4\.875rem/u);
    assert.match(markup, /width:4\.875rem/u);
  });

  it("q boşken tırnaksız filtre varyantına düşer", () => {
    const markup = render({ ...DISCOVER_DEFAULT_ROUTE_STATE, category: "oyun" });

    assert.match(markup, /Bu filtrelerle dizinde eşleşme yok\./u);
    assert.doesNotMatch(markup, /“”/u);
  });

  it("dört şerit kendi gövde metnini kullanır", () => {
    const expected: Readonly<Record<DiscoverLane, string>> = {
      channels: "“örnek” için popüler kanallarda eşleşme yok.",
      events: "“örnek” için herkese açık etkinliklerde eşleşme yok.",
      people: "“örnek” için kişi önerilerinde eşleşme yok.",
      servers: "“örnek” için dizinde eşleşme yok.",
    };

    for (const lane of ["servers", "people", "channels", "events"] as const) {
      assert.match(
        render({ ...DISCOVER_DEFAULT_ROUTE_STATE, lane, q: "örnek" }),
        new RegExp(expected[lane], "u"),
      );
    }
  });

  it("temizleme tüm parametreleri düşürür; davet CTA modal=join hedefler", () => {
    const markup = render({
      ...DISCOVER_DEFAULT_ROUTE_STATE,
      category: "destek",
      lane: "channels",
      q: "yardım",
      sort: "new",
    });

    assert.match(markup, /href="\/discover"[^>]*>Filtreleri temizle</u);
    assert.match(
      markup,
      /href="\/discover\?lane=channels&amp;cat=destek&amp;sort=new&amp;q=yard%C4%B1m&amp;modal=join"/u,
    );
  });
});
