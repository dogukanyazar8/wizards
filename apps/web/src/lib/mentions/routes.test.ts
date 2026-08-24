import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MENTIONS_DEFAULT_ROUTE_STATE,
  MENTIONS_ROUTE,
  buildMentionsHref,
  parseMentionFilter,
  parseMentionGrouping,
  parseMentionQuery,
  parseMentionSource,
  parseMentionWindow,
  parseMentionsRouteState,
  toggleMentionFilter,
  toggleMentionSource,
} from "./routes";

function params(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe("mentions routes — ayrıştırıcılar varsayılana düşer", () => {
  it("filtre", () => {
    assert.equal(parseMentionFilter("unread"), "unread");
    assert.equal(parseMentionFilter("role"), "role");
    assert.equal(parseMentionFilter("thread"), "thread");
    assert.equal(parseMentionFilter("uydurma"), "all");
    assert.equal(parseMentionFilter(null), "all");
  });

  it("gruplama", () => {
    assert.equal(parseMentionGrouping("source"), "source");
    assert.equal(parseMentionGrouping("time"), "time");
    assert.equal(parseMentionGrouping("kaynak"), "time");
  });

  it("pencere", () => {
    assert.equal(parseMentionWindow("all"), "all");
    assert.equal(parseMentionWindow("30d"), "30d");
    assert.equal(parseMentionWindow("90d"), "30d");
  });

  it("kaynak", () => {
    assert.equal(parseMentionSource("dm"), "dm");
    assert.equal(parseMentionSource("  s-1  "), "s-1");
    assert.equal(parseMentionSource(""), null);
    assert.equal(parseMentionSource("x".repeat(65)), null);
  });

  it("arama kırpılır ve sınırlanır", () => {
    assert.equal(parseMentionQuery("  kritik  "), "kritik");
    assert.equal(parseMentionQuery("   "), null);
    assert.equal(parseMentionQuery("a".repeat(200))?.length, 120);
  });
});

describe("mentions routes — durum okuma", () => {
  it("boş adres varsayılan durumu verir", () => {
    assert.deepEqual(parseMentionsRouteState(params("")), MENTIONS_DEFAULT_ROUTE_STATE);
  });

  it("her ekseni ayrı ayrı okur", () => {
    const state = parseMentionsRouteState(
      params(
        "filter=unread&source=s-1&group=source&window=all&q=kritik&panel=channel:m-1&modal=settings",
      ),
    );

    assert.deepEqual(state, {
      filter: "unread",
      source: "s-1",
      grouping: "source",
      window: "all",
      query: "kritik",
      panel: "channel:m-1",
      settingsOpen: true,
    });
  });

  it("modal parametresi yalnız `settings` değerini tanır", () => {
    assert.equal(parseMentionsRouteState(params("modal=poll")).settingsOpen, false);
  });
});

describe("mentions routes — adres yazımı", () => {
  it("varsayılanları adrese yazmaz", () => {
    assert.equal(buildMentionsHref(), MENTIONS_ROUTE);
    assert.equal(
      buildMentionsHref({ filter: "all", grouping: "time", window: "30d" }),
      MENTIONS_ROUTE,
    );
  });

  it("aynı durum her seferinde aynı dizeyi verir", () => {
    const href = buildMentionsHref({ filter: "unread", source: "s-1", grouping: "source" });

    assert.equal(href, "/mentions?filter=unread&source=s-1&group=source");
    assert.equal(buildMentionsHref({ source: "s-1", grouping: "source", filter: "unread" }), href);
  });

  it("yazdığını geri okur", () => {
    const state = {
      ...MENTIONS_DEFAULT_ROUTE_STATE,
      filter: "role" as const,
      source: "dm",
      window: "all" as const,
      query: "yayın",
      panel: "everyone:m-9",
      settingsOpen: true,
    };

    const href = buildMentionsHref(state);
    const [, search = ""] = href.split("?");

    assert.deepEqual(parseMentionsRouteState(params(search)), state);
  });

  it("arama metnini kodlar", () => {
    assert.match(buildMentionsHref({ query: "ürün & tasarım" }), /q=%C3%BCr%C3%BCn\+%26\+tasar/);
  });
});

describe("mentions routes — seçim kaldırma (SPEC §9)", () => {
  it("aynı filtreye tekrar basmak `all`'a döner", () => {
    assert.equal(toggleMentionFilter("unread", "unread"), "all");
    assert.equal(toggleMentionFilter("all", "unread"), "unread");
    assert.equal(toggleMentionFilter("me", "role"), "role");
  });

  it("aynı kaynağa tekrar basmak seçimi kaldırır", () => {
    assert.equal(toggleMentionSource("s-1", "s-1"), null);
    assert.equal(toggleMentionSource(null, "s-1"), "s-1");
    assert.equal(toggleMentionSource("s-1", "dm"), "dm");
  });
});
