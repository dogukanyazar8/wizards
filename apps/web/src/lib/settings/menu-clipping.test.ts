import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveMenuPlacement, SETTINGS_MENU_MAX_HEIGHT } from "@/lib/settings/menu-placement";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import { walkSettingsRows, type SettingsRowDef } from "@/lib/settings/tree";

/**
 * Ş13 §4 — açılır menü kırpılma ölçümü.
 *
 * İddia SPEC §4.4'ün kendisi: menü açıkken **ilk ve son seçeneğin** kutusu kaydırma alanının
 * içinde kalır. Ölçüm DOM'suz yapılıyor (paket testleri `node --test` + `renderToStaticMarkup`
 * üstünde, jsdom yok), bu yüzden kutu geometrisi ölçü sözlüğünden kuruluyor ve karar üretimdeki
 * saf fonksiyona — `resolveMenuPlacement` — soruluyor. Sahte bir yeniden uygulama yok: test
 * ürünün kararını çağırıyor, taklit etmiyor.
 *
 * Tarama tek bir konumla yetinmiyor: tetikleyici kaydırma alanının en üstünden en altına
 * **1 px adımlarla** yürütülüyor. Kırpılma tam olarak sınır konumlarda doğar; ortadan bir
 * örnek almak o konumları kaçırırdı.
 */

const { body, header, tabs, window: win } = SETTINGS_METRICS;
const { select } = SETTINGS_METRICS.controls;

/** Kaydırma alanı = pencere gövdesi − başlık − sekme şeridi. Ölçüler sözlükten. */
const HEADER_HEIGHT =
  header.paddingY * 2 +
  header.titleFontSize * header.titleLineHeight +
  header.leadMarginTop +
  header.leadFontSize * header.leadLineHeight;
const TABS_HEIGHT = tabs.tabHeight;
const SCROLL_AREA_TOP = HEADER_HEIGHT + TABS_HEIGHT;
const SCROLL_AREA_BOTTOM = win.height;

/** Bir seçeneğin kapladığı yükseklik: iki dolgu + satır kutusu. */
const OPTION_HEIGHT = select.optionPaddingY * 2 + Math.ceil(select.optionFontSize * 1.35);

function menuHeightOf(row: SettingsRowDef): number {
  const options = row.options?.length ?? 0;

  return Math.min(SETTINGS_MENU_MAX_HEIGHT, options * OPTION_HEIGHT + select.menuPadding * 2);
}

type Box = { bottom: number; top: number };

/**
 * Menü kutusunun görünüm alanı koordinatları.
 *
 * Aşağı açılan menü tetikleyicinin altından, yukarı açılan üstünden başlar; `maxHeight`
 * `resolveMenuPlacement`'ten gelir ve kutu tam o kadar uzar.
 */
function menuBox(triggerTop: number, triggerBottom: number, row: SettingsRowDef): Box {
  const placement = resolveMenuPlacement({
    menuHeight: menuHeightOf(row),
    scrollAreaBottom: SCROLL_AREA_BOTTOM,
    scrollAreaTop: SCROLL_AREA_TOP,
    triggerBottom,
    triggerTop,
  });

  return placement.direction === "down"
    ? { bottom: triggerBottom + placement.maxHeight, top: triggerBottom }
    : { bottom: triggerTop, top: triggerTop - placement.maxHeight };
}

const SELECT_ROWS = [...walkSettingsRows()].filter(
  ({ row }) => row.type === "select" && (row.options?.length ?? 0) > 0,
);

/** Kaydırma alanı içinde tetikleyicinin alabileceği her konum. */
function* triggerPositions(): Generator<{ bottom: number; top: number }> {
  for (let top = SCROLL_AREA_TOP; top + select.height <= SCROLL_AREA_BOTTOM; top += 1) {
    yield { bottom: top + select.height, top };
  }
}

describe("açılır menü kırpılma ölçümü", () => {
  it("ağaçta ölçülecek en az yirmi `select` satırı var", () => {
    assert.ok(SELECT_ROWS.length >= 20, `select satırı: ${SELECT_ROWS.length}`);
  });

  it("her `select` satırında ilk ve son seçenek kaydırma alanının içinde", () => {
    const clipped: string[] = [];

    for (const { row, section, tab } of SELECT_ROWS) {
      for (const trigger of triggerPositions()) {
        const box = menuBox(trigger.top, trigger.bottom, row);

        if (box.top < SCROLL_AREA_TOP - 0.5 || box.bottom > SCROLL_AREA_BOTTOM + 0.5) {
          clipped.push(`${section.key}/${tab.key}/${row.key} @${trigger.top}`);
          break;
        }
      }
    }

    assert.deepEqual(clipped, []);
  });

  it("menü hiçbir konumda tek seçeneğin altına düşmüyor", () => {
    const starved: string[] = [];

    for (const { row, section, tab } of SELECT_ROWS) {
      for (const trigger of triggerPositions()) {
        const box = menuBox(trigger.top, trigger.bottom, row);

        if (box.bottom - box.top < OPTION_HEIGHT) {
          starved.push(`${section.key}/${tab.key}/${row.key} @${trigger.top}`);
          break;
        }
      }
    }

    assert.deepEqual(starved, []);
  });

  /**
   * Prompt'un adıyla saydığı üç kritik vaka. Üçü de sekmesinin **dibinde** duruyor: aşağıda
   * 236 px yok, menü yukarı açılmak zorunda.
   */
  const CRITICAL: ReadonlyArray<readonly [string, string, string]> = [
    ["account", "privacy", "l2"],
    ["notifications", "quiet-hours", "nq4"],
    ["av", "audio", "p7"],
  ];

  it("üç kritik vaka sekmenin dibinde yukarı açılıyor ve kırpılmıyor", () => {
    for (const [sectionKey, tabKey, rowKey] of CRITICAL) {
      const entry = SELECT_ROWS.find(
        ({ row, section, tab }) =>
          section.key === sectionKey && tab.key === tabKey && row.key === rowKey,
      );

      assert.ok(entry, `${sectionKey}/${tabKey}/${rowKey} ağaçta yok`);

      // En kötü konum: satır kaydırma alanının son pikselinde.
      const triggerBottom = SCROLL_AREA_BOTTOM;
      const triggerTop = triggerBottom - select.height;
      const placement = resolveMenuPlacement({
        menuHeight: menuHeightOf(entry.row),
        scrollAreaBottom: SCROLL_AREA_BOTTOM,
        scrollAreaTop: SCROLL_AREA_TOP,
        triggerBottom,
        triggerTop,
      });

      assert.equal(placement.direction, "up", `${rowKey} aşağı açılıyor`);

      const box = menuBox(triggerTop, triggerBottom, entry.row);

      assert.ok(box.top >= SCROLL_AREA_TOP, `${rowKey} üstten taşıyor`);
      assert.ok(box.bottom <= SCROLL_AREA_BOTTOM, `${rowKey} alttan taşıyor`);
      assert.ok(box.bottom - box.top >= OPTION_HEIGHT, `${rowKey} tek seçenek bile sığmıyor`);
    }
  });

  it("içerik kolonu menü genişliğini kırpmıyor", () => {
    // Menü satırın sağ ekseninde açılıyor ve en az `menuMinWidth` kadar geniş; içerik kolonu
    // (`body.maxWidth`) ondan dar olsaydı menü kolondan taşardı.
    assert.ok(body.maxWidth > select.menuMinWidth + body.paddingX * 2);
    assert.equal(select.menuMinWidth, select.width);
  });
});
