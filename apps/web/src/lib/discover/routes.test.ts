import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DISCOVER_DEFAULT_ROUTE_STATE,
  DISCOVER_ROUTE,
  buildDiscoverHref,
  clearDiscoverFilters,
  closeTopDiscoverLayer,
  hasActiveDiscoverFilters,
  parseDiscoverRoute,
  type DiscoverRouteState,
} from "./routes";

function parse(search: string): DiscoverRouteState {
  return parseDiscoverRoute(new URLSearchParams(search));
}

describe("parseDiscoverRoute", () => {
  it("boş adres varsayılan durumu verir", () => {
    assert.deepEqual(parse(""), DISCOVER_DEFAULT_ROUTE_STATE);
  });

  it("dört ekseni de okur", () => {
    assert.deepEqual(parse("lane=channels&cat=oyun&sort=online&q=dil"), {
      category: "oyun",
      lane: "channels",
      modal: null,
      panelServerId: null,
      q: "dil",
      sort: "online",
    });
  });

  it("panel ve modal aynı anda bulunabilir", () => {
    // SPEC §7: ikisi birlikte açık kalabilir; `Esc` önce modalı kapatır.
    const state = parse("panel=s-1&modal=join");

    assert.equal(state.panelServerId, "s-1");
    assert.equal(state.modal, "join");
  });

  it("tanınmayan değer varsayılana düşer, atmaz", () => {
    const state = parse("lane=uzay&cat=felsefe&sort=alfabetik&modal=ayarlar");

    assert.deepEqual(state, DISCOVER_DEFAULT_ROUTE_STATE);
  });

  it("aramayı kırpar, boş aramayı düşürür", () => {
    assert.equal(parse("q=%20%20dil%20%20").q, "dil");
    assert.equal(parse("q=%20%20").q, "");
  });

  it("aramayı 80 karakterde keser", () => {
    const long = "a".repeat(120);

    assert.equal(parse(`q=${long}`).q.length, 80);
  });

  it("aşırı uzun panel kimliğini yok sayar", () => {
    assert.equal(parse(`panel=${"s".repeat(65)}`).panelServerId, null);
    assert.equal(parse(`panel=${"s".repeat(64)}`).panelServerId, `${"s".repeat(64)}`);
  });
});

describe("buildDiscoverHref", () => {
  it("varsayılan durumu adrese yazmaz", () => {
    assert.equal(buildDiscoverHref(), DISCOVER_ROUTE);
    assert.equal(buildDiscoverHref(DISCOVER_DEFAULT_ROUTE_STATE), DISCOVER_ROUTE);
  });

  it("anahtar sırası sabittir", () => {
    assert.equal(
      buildDiscoverHref({
        category: "oyun",
        lane: "people",
        modal: "join",
        panelServerId: "s-1",
        q: "dil",
        sort: "new",
      }),
      "/discover?lane=people&cat=oyun&sort=new&q=dil&panel=s-1&modal=join",
    );
  });

  it("kısmi durumu taban durumun üzerine yamar", () => {
    const base = parse("cat=oyun&sort=online");

    // Sekmeye basmak kategoriyi düşürmez.
    assert.equal(
      buildDiscoverHref({ lane: "events" }, base),
      "/discover?lane=events&cat=oyun&sort=online",
    );
  });

  it("yazarken de aramayı kırpar", () => {
    assert.equal(buildDiscoverHref({ q: "  dil  " }), "/discover?q=dil");
    assert.equal(buildDiscoverHref({ q: "   " }), DISCOVER_ROUTE);
  });

  it("adres bir tur gidip geldiğinde aynı durumu verir", () => {
    const state = parse("lane=channels&cat=destek&sort=new&q=hata&panel=s-17&modal=join");
    const href = buildDiscoverHref(state);
    const roundTripped = parse(href.slice(href.indexOf("?") + 1));

    assert.deepEqual(roundTripped, state);
  });
});

describe("closeTopDiscoverLayer", () => {
  it("önce modalı kapatır", () => {
    const state = parse("panel=s-1&modal=join");
    const next = closeTopDiscoverLayer(state);

    assert.equal(next.modal, null);
    assert.equal(next.panelServerId, "s-1");
  });

  it("modal kapalıysa paneli kapatır", () => {
    const next = closeTopDiscoverLayer(parse("panel=s-1"));

    assert.equal(next.panelServerId, null);
  });

  it("kapatacak katman yoksa aynı nesneyi döner", () => {
    const state = parse("cat=oyun");

    assert.equal(closeTopDiscoverLayer(state), state);
  });
});

describe("filtre sıfırlama", () => {
  it("kategori, sıralama ve aramayı temizler", () => {
    const next = clearDiscoverFilters(parse("lane=people&cat=oyun&sort=new&q=dil&panel=s-1"));

    assert.equal(next.category, "all");
    assert.equal(next.sort, "popular");
    assert.equal(next.q, "");
  });

  it("şeridi, paneli ve modalı korur", () => {
    // Kanallar şeridinde arama yapan kullanıcı, "Filtreleri temizle" ile Sunucular'a atılmaz.
    const next = clearDiscoverFilters(parse("lane=channels&q=dil&panel=s-1&modal=join"));

    assert.equal(next.lane, "channels");
    assert.equal(next.panelServerId, "s-1");
    assert.equal(next.modal, "join");
  });
});

describe("hasActiveDiscoverFilters", () => {
  it("üç eksenden biri varsayılandan saparsa şerit çizilir", () => {
    assert.equal(hasActiveDiscoverFilters(parse("")), false);
    assert.equal(hasActiveDiscoverFilters(parse("lane=events")), false);
    assert.equal(hasActiveDiscoverFilters(parse("cat=oyun")), true);
    assert.equal(hasActiveDiscoverFilters(parse("sort=new")), true);
    assert.equal(hasActiveDiscoverFilters(parse("q=dil")), true);
  });
});
