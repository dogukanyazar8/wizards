import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MentionCounts } from "@wizards/types";

import {
  MentionsSidebar,
  buildMentionSourceRows,
  type MentionSourceInput,
} from "@/components/mentions/mentions-sidebar";
import { MENTIONS_SEARCH_DEBOUNCE_MS } from "@/components/mentions/mentions-rail-container";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { MENTIONS_METRICS, pxToRem } from "@/lib/mentions/metrics";
import { MENTIONS_DEFAULT_ROUTE_STATE, type MentionsRouteState } from "@/lib/mentions/routes";

const { sidebar, shell } = MENTIONS_METRICS;

function counts(overrides: Partial<MentionCounts> = {}): MentionCounts {
  return {
    all: 7,
    unread: 2,
    me: 3,
    role: 2,
    everyone: 1,
    thread: 1,
    readLater: 0,
    roleNames: [],
    bySource: { "server-whispr": 3, "server-product": 2, "server-oyun": 1, dm: 2 },
    ...overrides,
  };
}

const SERVERS: readonly MentionSourceInput[] = [
  { id: "server-oyun", name: "Oyun Kulübü", shortName: null },
  { id: "server-product", name: "Product Team", shortName: null },
  { id: "server-whispr", name: "Whispr Topluluğu", shortName: null },
];

function renderSidebar(overrides: Partial<React.ComponentProps<typeof MentionsSidebar>> = {}) {
  const routeState: MentionsRouteState = overrides.routeState ?? MENTIONS_DEFAULT_ROUTE_STATE;

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <MentionsSidebar
        counts={counts()}
        countsLoading={false}
        markAllPending={false}
        onMarkAllRead={() => undefined}
        onQueryChange={() => undefined}
        roleNames={["tasarım", "ürün"]}
        routeState={routeState}
        sources={buildMentionSourceRows(counts(), SERVERS, "Direkt mesajlar")}
        username="doğukan"
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("buildMentionSourceRows", () => {
  it("sunucuları bahsetme sayısına göre azalan sıralar, DM'i en sona koyar", () => {
    const rows = buildMentionSourceRows(counts(), SERVERS, "Direkt mesajlar");

    assert.deepEqual(
      rows.map((row) => row.id),
      ["server-whispr", "server-product", "server-oyun", "dm"],
    );
    // DM sayısı (2) ikinci sunucununkine eşit; sıralama onu yine de en sona koyar.
    assert.equal(rows.at(-1)?.kind, "dm");
    assert.equal(rows.at(-1)?.name, "Direkt mesajlar");
  });

  it("penceresinde bahsetmesi olmayan kaynağı listelemez", () => {
    const rows = buildMentionSourceRows(
      counts({ bySource: { "server-whispr": 3, "server-product": 0, dm: 0 } }),
      SERVERS,
      "Direkt mesajlar",
    );

    assert.deepEqual(
      rows.map((row) => row.id),
      ["server-whispr"],
    );
  });

  it("sayı eşitliğinde ada göre sıralar — aynı veri her yüklemede aynı sırayı verir", () => {
    const rows = buildMentionSourceRows(
      counts({ bySource: { "server-oyun": 2, "server-product": 2 } }),
      SERVERS,
      "Direkt mesajlar",
    );

    assert.deepEqual(
      rows.map((row) => row.name),
      ["Oyun Kulübü", "Product Team"],
    );
  });

  it("sayaç yokken boş liste döner", () => {
    assert.deepEqual(buildMentionSourceRows(null, SERVERS, "Direkt mesajlar"), []);
  });

  it("adı bilinmeyen kaynağı atlar — kimliği ekrana yazmaz", () => {
    // Kullanıcı sunucudan ayrılmışsa sayaçta kimliği kalabilir; uuid bir satır adı değildir.
    const rows = buildMentionSourceRows(counts({ bySource: { "server-yok": 4 } }), SERVERS, "DM");

    assert.deepEqual(rows, []);
  });
});

describe("MentionsSidebar", () => {
  it("276 genişliğinde ve başlık/aksiyon/arama bölümlerini taşır", () => {
    const html = renderSidebar();

    assert.ok(html.includes(`width:${pxToRem(shell.railWidth)}`));
    assert.ok(html.includes("Bahsedilmeler"));
    assert.ok(html.includes("Tümünü okundu işaretle"));
    assert.ok(html.includes('placeholder="Bahsetmelerde ara"'));
    assert.ok(html.includes("Türe göre"));
    assert.ok(html.includes("Kaynağa göre"));
  });

  it("okunmamış sayacını `--danger` rozetiyle ve metin karşılığıyla gösterir", () => {
    const html = renderSidebar();

    assert.ok(html.includes("2 okunmamış bahsetme"));
    assert.ok(html.includes(`min-width:${pxToRem(sidebar.badgeMinWidth)}`));
  });

  it("okunmamış yoksa rozeti hiç render etmez", () => {
    const html = renderSidebar({ counts: counts({ unread: 0 }) });

    assert.ok(!html.includes("okunmamış bahsetme"));
    assert.ok(!html.includes('data-testid="mentions-sidebar-unread-total"'));
  });

  it("dört tür satırını tasarımın sırası, glifi ve alt metniyle çizer", () => {
    const html = renderSidebar();

    for (const glyph of [">@<", ">R<", ">T<", ">!<"]) {
      assert.ok(html.includes(glyph), glyph);
    }

    assert.ok(html.includes("Bana özel"));
    assert.ok(html.includes("@doğukan"));
    assert.ok(html.includes("Rol bahsetmeleri"));
    assert.ok(html.includes("@tasarım · @ürün"));
    assert.ok(html.includes("Takip ettiğin thread&#x27;ler"));
    assert.ok(html.includes("Sayaca yansıyanlar"));
  });

  it("bahsedilebilir rol yoksa alt metin boş kalmaz", () => {
    const html = renderSidebar({ roleNames: [] });

    assert.ok(html.includes("Bahsedilebilir rolün yok"));
  });

  it("üçten fazla rolü `+{n}` ile kısaltır", () => {
    const html = renderSidebar({ roleNames: ["tasarım", "ürün", "mühendislik", "destek"] });

    assert.ok(html.includes("@tasarım · @ürün · @mühendislik · +1"));
  });

  it("`Okunmamış` pili `--danger`, diğerleri `--surface-soft`", () => {
    const html = renderSidebar();

    assert.ok(html.includes("background:hsl(var(--danger))"));
    assert.ok(html.includes("background:hsl(var(--surface-soft))"));
  });

  it("tür satırı URL'e filtre yazar, seçili satır `all`'a döner", () => {
    const unselected = renderSidebar();
    assert.ok(unselected.includes('href="/mentions?filter=me"'));

    const selected = renderSidebar({
      routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, filter: "me" },
    });
    assert.ok(selected.includes('href="/mentions"'));
    assert.ok(selected.includes('aria-current="true"'));
  });

  it("tür satırı kaynak seçimini ve aramayı korur", () => {
    const html = renderSidebar({
      routeState: {
        ...MENTIONS_DEFAULT_ROUTE_STATE,
        source: "server-whispr",
        query: "kritik",
      },
    });

    assert.ok(html.includes('href="/mentions?filter=me&amp;source=server-whispr&amp;q=kritik"'));
  });

  it("kaynak satırı URL'e kaynak yazar, seçili satır seçimi kaldırır", () => {
    const unselected = renderSidebar();
    assert.ok(unselected.includes('href="/mentions?source=server-whispr"'));

    const selected = renderSidebar({
      routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, source: "server-whispr" },
    });
    assert.ok(selected.includes('href="/mentions"'));
  });

  it("DM satırının tile'ı yuvarlak", () => {
    const html = renderSidebar();

    assert.ok(html.includes(`border-radius:${sidebar.sourceRowTileRadiusDm}`));
  });

  it("`Kaynağa göre` etiketinin sağında toplam kaynak sayısı durur", () => {
    const html = renderSidebar();

    assert.ok(html.includes('data-testid="mentions-sidebar-source-total">4<'));
  });

  it("zil butonu `?modal=settings` yazar; açıkken kapatır ve vurgulanır", () => {
    const closed = renderSidebar();
    assert.ok(closed.includes('href="/mentions?modal=settings"'));

    const open = renderSidebar({
      routeState: { ...MENTIONS_DEFAULT_ROUTE_STATE, settingsOpen: true },
    });
    assert.ok(open.includes("background:hsl(var(--primary)/0.15)"));
    assert.ok(open.includes('aria-expanded="true"'));
  });

  it("sayaç sorgusu düşerse satırlar sayısız çizilir, ray çökmez", () => {
    const html = renderSidebar({ counts: null, sources: [] });

    assert.ok(html.includes("Bana özel"));
    assert.ok(!html.includes('data-testid="mentions-sidebar-kind-pill"'));
    assert.ok(!html.includes('data-testid="mentions-sidebar-unread-total"'));
  });

  it("yüklenirken kendi iskeletini gösterir — akış sorgusunu beklemez", () => {
    const html = renderSidebar({ counts: null, countsLoading: true, sources: [] });

    assert.ok(html.includes('data-testid="mentions-sidebar-skeleton"'));
    assert.ok(html.includes("Bahsetme rayı yükleniyor"));
  });

  it("okunmamış yokken `Tümünü okundu işaretle` devre dışı", () => {
    const html = renderSidebar({ counts: counts({ unread: 0 }) });

    assert.ok(html.includes('data-testid="mentions-sidebar-mark-all" disabled'));
  });
});

describe("bahsetme araması", () => {
  it("250ms debounce ile URL'e yazar", () => {
    // Değer SPEC §3'ten gelir; bir tuş vuruşu başına `router.replace` geçmiş yığınını
    // ve sunucu sorgusunu çöpe çevirirdi.
    assert.equal(MENTIONS_SEARCH_DEBOUNCE_MS, 250);
  });
});
