import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverCategory } from "@wizards/types";
import type { InfiniteData } from "@tanstack/react-query";

import { readDiscoverCachedCategories } from "@/components/discover/discover-rail-container";
import { DiscoverSidebar, resolveDiscoverQueryEcho } from "@/components/discover/discover-sidebar";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { DiscoverServerClientPage } from "@/lib/discover/client";
import { getMessagesForLocale } from "@/lib/locale";
import type { DiscoverRouteState } from "@/lib/discover/routes";

const CATEGORIES: readonly DiscoverCategory[] = [
  { count: 20, initials: "TÜ", key: "all", label: "Tümü" },
  { count: 4, initials: "OY", key: "oyun", label: "Oyun" },
  { count: 4, initials: "İŞ", key: "is", label: "İş" },
  { count: 4, initials: "ÇA", key: "calisma", label: "Çalışma" },
  { count: 4, initials: "Kİ", key: "kisisel", label: "Kişisel" },
  { count: 4, initials: "DE", key: "destek", label: "Destek" },
];

const ROUTE_STATE: DiscoverRouteState = {
  category: "oyun",
  lane: "people",
  modal: null,
  panelServerId: null,
  q: "oyun",
  sort: "online",
};

function renderSidebar(
  categories: readonly DiscoverCategory[] | null = CATEGORIES,
  routeState: DiscoverRouteState = ROUTE_STATE,
): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DiscoverSidebar
        categories={categories}
        onQueryChange={() => undefined}
        routeState={routeState}
      />
    </LocaleProvider>,
  );
}

describe("DiscoverSidebar", () => {
  it("altı kategori satırını tasarım baş harfleri ve sayaçlarıyla çizer", () => {
    const markup = renderSidebar();
    const rows = markup.match(/<a[^>]*data-testid="discover-category-row"[\s\S]*?<\/a>/gu) ?? [];

    assert.equal(rows.length, 6);
    assert.equal((markup.match(/data-testid="discover-category-pill"/gu) ?? []).length, 6);
    for (const [index, [initials, count]] of [
      ["TÜ", 20],
      ["OY", 4],
      ["İŞ", 4],
      ["ÇA", 4],
      ["Kİ", 4],
      ["DE", 4],
    ].entries()) {
      assert.match(rows[index] ?? "", new RegExp(`>${initials}<`, "u"));
      assert.match(
        rows[index] ?? "",
        new RegExp(`data-testid="discover-category-pill"[^>]*>${count}<`, "u"),
      );
    }
  });

  it("sayaçlar yokken satırları pilsiz bağlantı olarak korur", () => {
    const markup = renderSidebar(null);

    assert.equal((markup.match(/data-testid="discover-category-pill"/gu) ?? []).length, 0);
    assert.equal((markup.match(/data-testid="discover-category-row"/gu) ?? []).length, 6);
    assert.equal((markup.match(/data-testid="discover-category-row"[^>]*href=/gu) ?? []).length, 6);
  });

  it("yalnız seçili kategoriye aria-selected verir", () => {
    const markup = renderSidebar();
    const rows = markup.match(/<a[^>]*data-testid="discover-category-row"[^>]*>/gu) ?? [];

    assert.equal(rows.filter((row) => row.includes('aria-selected="true"')).length, 1);
    assert.equal(rows.filter((row) => row.includes('aria-selected="false"')).length, 5);
  });

  it("iki listbox'ta yalnız seçili satırı Tab sırasına alır", () => {
    const markup = renderSidebar();
    const categoryRows = markup.match(/<a[^>]*data-testid="discover-category-row"[^>]*>/gu) ?? [];
    const sortRows = markup.match(/<a[^>]*data-testid="discover-sort-row"[^>]*>/gu) ?? [];

    assert.equal(categoryRows.filter((row) => row.includes('tabindex="0"')).length, 1);
    assert.equal(categoryRows.filter((row) => row.includes('tabindex="-1"')).length, 5);
    assert.equal(sortRows.filter((row) => row.includes('tabindex="0"')).length, 1);
    assert.equal(sortRows.filter((row) => row.includes('tabindex="-1"')).length, 2);
  });

  it("dolu aramada erişilebilir temizle düğmesini gösterir", () => {
    const markup = renderSidebar();

    assert.match(markup, /data-testid="discover-search-clear"/u);
    assert.match(markup, /aria-label="Aramayı temizle"/u);
    assert.match(markup, /before:-inset-3/u);
  });

  it("kategori bağlantıları cat ve açık lane=servers parametrelerini taşır", () => {
    const markup = renderSidebar();
    const hrefs = [
      ...markup.matchAll(/data-testid="discover-category-row"[^>]*href="([^"]+)"/gu),
    ].map((match) => match[1]?.replaceAll("&amp;", "&") ?? "");

    assert.equal(hrefs.length, 6);
    assert.ok(hrefs.every((href) => href.includes("lane=servers")));
    for (const category of ["all", "oyun", "is", "calisma", "kisisel", "destek"]) {
      assert.ok(
        hrefs.some((href) => href.includes(`cat=${category}`)),
        category,
      );
    }
  });

  it("render sırasında fetch açmaz", () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = () => {
      calls += 1;
      throw new Error("DiscoverSidebar fetch açmamalı");
    };

    try {
      renderSidebar();
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls, 0);
  });

  it("eski URL yankısının daha yeni arama taslağını ezmesini engeller", () => {
    assert.deepEqual(resolveDiscoverQueryEcho("eski", "yeni"), {
      adoptRouteQuery: false,
      pendingLocalQuery: "yeni",
    });
    assert.deepEqual(resolveDiscoverQueryEcho("yeni", "yeni"), {
      adoptRouteQuery: false,
      pendingLocalQuery: null,
    });
    assert.deepEqual(resolveDiscoverQueryEcho("geri", null), {
      adoptRouteQuery: true,
      pendingLocalQuery: null,
    });
  });
});

describe("DiscoverRailContainer cache sözleşmesi", () => {
  it("ilk sunucu sayfasının kategori nesnesini aynen kullanır", () => {
    const cached: InfiniteData<DiscoverServerClientPage> = {
      pageParams: [undefined],
      pages: [
        {
          categories: [...CATEGORIES],
          featured: null,
          items: [],
          nextCursor: null,
          totalCount: 20,
        },
      ],
    };

    assert.deepEqual(readDiscoverCachedCategories(cached), CATEGORIES);
  });

  it("önbellek boşsa pilsiz durum için null döner", () => {
    assert.equal(readDiscoverCachedCategories(undefined), null);
  });
});
