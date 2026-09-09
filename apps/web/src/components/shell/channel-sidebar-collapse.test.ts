import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  countHiddenInCollapsedCategory,
  filterCollapsedCategoryChannels,
} from "@/lib/servers/channel-visibility";

/**
 * Ş4 — daraltılmış kategori kuralı (SPEC-SUNUCU §2.4).
 *
 * İki yönlü denetim:
 *
 * 1. **Davranış** — kural üç kanalı geçirir (aktif · okunmamışı olan · içinde konuşan) ve
 *    kalanı sayar. Bu kısım Ş0'ın saf fonksiyonuna ait; burada kenar çubuğunun gerçekten
 *    kullandığı girdi biçimiyle (kanal kaydı + `voiceStates` haritası) sürülüyor.
 * 2. **Kaynak** — `channel-sidebar.tsx` kuralı **çağırıyor**, yeniden yazmıyor. Kopya bir
 *    filtre ilk gün aynı sonucu verir, ikinci gün `⌘K` popover'ının "daraltılmış kategoride
 *    de bul" davranışından ayrışır. `jsdom` olmadığı için render yolu e2e'de
 *    (`server-parity.spec.ts`) sürülüyor; buradaki kapı ikinci bir tanımın doğmasını
 *    engellemek.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sidebarSource = readFileSync(join(here, "channel-sidebar.tsx"), "utf8");
const metricsSource = readFileSync(join(here, "../../lib/servers/metrics.ts"), "utf8");

const CHANNELS = [
  { id: "active", unreadCount: 0 },
  { id: "unread", unreadCount: 12 },
  { id: "talking", unreadCount: 0 },
  { id: "quiet-text", unreadCount: 0 },
  { id: "empty-voice", unreadCount: 0 },
];

const CONTEXT = {
  activeChannelId: "active",
  voiceStates: new Map([
    ["talking", 2],
    ["empty-voice", 0],
  ]),
};

describe("daraltılmış kategori — davranış", () => {
  it("yalnız aktif / okunmamışı olan / içinde konuşan kanal kalır", () => {
    assert.deepEqual(
      filterCollapsedCategoryChannels(CHANNELS, CONTEXT).map((channel) => channel.id),
      ["active", "unread", "talking"],
    );
  });

  it("gizlenen kanal sayısı `N gizli` çipini besler", () => {
    assert.equal(countHiddenInCollapsedCategory(CHANNELS, CONTEXT), 2);
  });

  it("boş ses kanalı geçmez — katılımcı sayısı sıfırsa konuşan yoktur", () => {
    assert.equal(
      filterCollapsedCategoryChannels(CHANNELS, CONTEXT).some(
        (channel) => channel.id === "empty-voice",
      ),
      false,
    );
  });

  it("hiçbir ölçüt tutmuyorsa liste boşalır ve hepsi gizli sayılır", () => {
    const context = { activeChannelId: null, voiceStates: new Map<string, number>() };
    const quiet = [
      { id: "a", unreadCount: 0 },
      { id: "b", unreadCount: 0 },
    ];

    assert.deepEqual(filterCollapsedCategoryChannels(quiet, context), []);
    assert.equal(countHiddenInCollapsedCategory(quiet, context), 2);
  });
});

describe("daraltılmış kategori — kaynak sözleşmesi", () => {
  it("kenar çubuğu Ş0'ın fonksiyonlarını çağırır", () => {
    assert.match(sidebarSource, /filterCollapsedCategoryChannels\(channels, collapsedContext\)/u);
    assert.match(sidebarSource, /countHiddenInCollapsedCategory\(channels, collapsedContext\)/u);
  });

  it("kuralı yeniden yazmaz — kendi `unreadCount > 0` filtresi yok", () => {
    assert.ok(
      !/channels\.filter\([^)]*unreadCount/u.test(sidebarSource),
      "kenar çubuğunda ikinci bir daraltma filtresi var",
    );
  });

  it("daraltılmış hâl sürüklenmez — süzülmüş satır `SortableChannelRow` almaz", () => {
    assert.match(
      sidebarSource,
      /collapsedChannels\.map\(\(channel\) => renderChannelRow\(channel, false\)\)/u,
    );
    assert.match(
      sidebarSource,
      /channels\.map\(\(channel\) => renderChannelRow\(channel, true\)\)/u,
    );
  });
});

describe("Ş4 — referans satırının kabuğu", () => {
  const itemSource = readFileSync(join(here, "channel-item.tsx"), "utf8");

  it("kolonun zemini `surface-panel`, kenarı `border/.4` — degrade yok", () => {
    assert.match(sidebarSource, /background: "hsl\(var\(--surface-panel\)\)"/u);
    assert.match(sidebarSource, /sidebarBorderAlpha/u);
    assert.ok(
      !sidebarSource.includes("linear-gradient"),
      "kenar çubuğu hâlâ degrade zemin çiziyor",
    );
  });

  it("kabuk sütunu ikinci bir zemin çizmiyor", () => {
    const shellSource = readFileSync(join(here, "wizards-shell.tsx"), "utf8");
    const thirdColumn = shellSource.slice(
      shellSource.indexOf("{thirdColumn === null ? null : ("),
      shellSource.indexOf('{thirdColumn === "messages" ? ('),
    );

    assert.ok(!thirdColumn.includes("linear-gradient"), "sütun degrade çiziyor");
    assert.ok(!thirdColumn.includes("border-r"), "sütun kenar çiziyor");
  });

  it("kategori başlığında tutamak · ok çifti · `···` yok", () => {
    assert.ok(!sidebarSource.includes("GripVertical"), "sürükleme tutamağı duruyor");
    assert.ok(!sidebarSource.includes("MoreHorizontal"), "`···` düğmesi duruyor");
    assert.ok(!sidebarSource.includes("moveDisplayGroup"), "ok çifti duruyor");
    assert.ok(!sidebarSource.includes("showCategoryMoveControls"), "taşıma tercihi duruyor");
  });

  it("kategori `+` düğmesi referansın kalınlığını kullanır", () => {
    assert.match(sidebarSource, /strokeWidth=\{sidebar\.categoryAddIconStrokeWidth\}/u);
  });

  it("kategori aç/kapat oku referansın 12px ve 3px çizgi sözleşmesini kullanır", () => {
    assert.ok(
      !sidebarSource.includes("categoryCaretOpticalOffsetY"),
      "referansta olmayan dikey optik ofset duruyor",
    );
    assert.match(sidebarSource, /collapsed \? "rotate\(-90deg\)" : "rotate\(0deg\)"/u);
    assert.match(
      sidebarSource,
      /height: pxToRem\(sidebar\.categoryCaretSize\)[\s\S]*width: pxToRem\(sidebar\.categoryCaretSize\)/u,
    );
    assert.match(sidebarSource, /strokeWidth=\{sidebar\.categoryCaretStrokeWidth\}/u);
    assert.match(metricsSource, /categoryCaretSize: 12/u);
    assert.match(metricsSource, /categoryCaretStrokeWidth: 3/u);
  });

  it("satırda kalem/çöp kaplaması yok; düzenle-sil sağ tık menüsünde", () => {
    assert.ok(!itemSource.includes("data-channel-edit-name"));
    assert.match(sidebarSource, /server\.sidebar\.channel\.edit/u);
    assert.match(sidebarSource, /server\.sidebar\.channel\.delete/u);
  });

  it("sürükleme demeti satırın kendi düğmesine geçiyor", () => {
    assert.match(sidebarSource, /dragHandleProps: \{ \.\.\.attributes, \.\.\.listeners \}/u);
    assert.match(itemSource, /\{\.\.\.dragHandleProps\}/u);
  });
});

describe("Ş4 sınırları — bozulmayacak kablolama", () => {
  it("dnd-kit sıralaması yerinde", () => {
    for (const marker of [
      "DndContext",
      "SortableContext",
      "useSortable",
      "ChannelDropZone",
      "reorderChannelsRequest",
      "reorderCategoriesRequest",
    ]) {
      assert.ok(sidebarSource.includes(marker), `${marker} kaybolmuş`);
    }
  });

  it("kategori sürüklemesi başlığın kendisinden sürüyor", () => {
    assert.match(sidebarSource, /categorySortable\.attributes, \.\.\.categorySortable\.listeners/u);
    assert.match(sidebarSource, /\{\.\.\.categoryDragProps\}/u);
  });

  it("`collapsedCategories` store'u ve `UserProfileFooter` yerinde", () => {
    assert.ok(sidebarSource.includes("collapsedCategories: state.collapsedCategories"));
    assert.ok(sidebarSource.includes("toggleCategoryCollapse: state.toggleCategoryCollapse"));
    assert.ok(sidebarSource.includes("<UserProfileFooter"));
  });

  it("`⌘K` gerçek bir kısayola bağlanmadı — komut paleti ezilmiyor", () => {
    const popoverSource = readFileSync(join(here, "channel-search-popover.tsx"), "utf8");

    assert.ok(!popoverSource.includes("metaKey"));
    assert.ok(!popoverSource.includes("ctrlKey"));
    assert.ok(!popoverSource.includes('key === "k"'));
  });
});
