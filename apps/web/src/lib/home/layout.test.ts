import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESPONSIVE_BREAKPOINTS } from "@/lib/responsive";

import {
  COMMAND_CENTER_CARD_ATTRIBUTE,
  COMMAND_CENTER_GRID,
  COMMAND_CENTER_GRID_ATTRIBUTE,
  buildCommandCenterCss,
  selectCommandCenterLayout,
  toGridArea,
  type CommandCenterCardId,
  type CommandCenterLayout,
} from "./layout";
import { selectUiScale } from "./scale";

const CARD_IDS: readonly CommandCenterCardId[] = [
  "continue",
  "live",
  "awaiting",
  "presence",
  "upNext",
  "friends",
];

describe("selectCommandCenterLayout — §3 eşikleri", () => {
  it("1360 ve üstü dört kolondur", () => {
    assert.equal(selectCommandCenterLayout(1360), "wide");
    assert.equal(selectCommandCenterLayout(1920), "wide");
    assert.equal(selectCommandCenterLayout(3840), "wide");
  });

  it("960–1359 iki kolondur", () => {
    assert.equal(selectCommandCenterLayout(960), "medium");
    assert.equal(selectCommandCenterLayout(1100), "medium");
    assert.equal(selectCommandCenterLayout(1359), "medium");
  });

  it("960'ın altı tek kolondur", () => {
    assert.equal(selectCommandCenterLayout(959), "narrow");
    assert.equal(selectCommandCenterLayout(720), "narrow");
    assert.equal(selectCommandCenterLayout(320), "narrow");
  });

  it("eşikler `RESPONSIVE_BREAKPOINTS`ten gelir, JSX'e yazılmaz", () => {
    assert.equal(RESPONSIVE_BREAKPOINTS.commandCenter, 960);
    assert.equal(RESPONSIVE_BREAKPOINTS.commandCenterWide, 1360);
    assert.equal(selectCommandCenterLayout(RESPONSIVE_BREAKPOINTS.commandCenter - 1), "narrow");
    assert.equal(selectCommandCenterLayout(RESPONSIVE_BREAKPOINTS.commandCenterWide - 1), "medium");
  });

  it("ölçülemeyen genişlik geniş düzene düşer", () => {
    assert.equal(selectCommandCenterLayout(0), "wide");
    assert.equal(selectCommandCenterLayout(Number.NaN), "wide");
    assert.equal(selectCommandCenterLayout(-1), "wide");
  });
});

describe("COMMAND_CENTER_GRID — yerleşim açıkça yazılı", () => {
  it("her kırılımda altı kartın altısı da yerleştirilmiş", () => {
    for (const layout of ["wide", "medium", "narrow"] as CommandCenterLayout[]) {
      assert.deepEqual(
        Object.keys(COMMAND_CENTER_GRID[layout].cards).sort(),
        [...CARD_IDS].sort(),
        layout,
      );
    }
  });

  it("hiçbir kart ızgaranın dışına taşmaz", () => {
    for (const layout of ["wide", "medium", "narrow"] as CommandCenterLayout[]) {
      const grid = COMMAND_CENTER_GRID[layout];

      for (const id of CARD_IDS) {
        const card = grid.cards[id];

        assert.ok(card.columnStart >= 1, `${layout}/${id}`);
        assert.ok(card.columnStart + card.columnSpan - 1 <= grid.columns, `${layout}/${id}`);
        assert.ok(card.rowStart >= 1, `${layout}/${id}`);
        assert.ok(card.rowStart + card.rowSpan - 1 <= grid.rows, `${layout}/${id}`);
      }
    }
  });

  it("iki kart aynı hücreyi paylaşmaz", () => {
    for (const layout of ["wide", "medium", "narrow"] as CommandCenterLayout[]) {
      const grid = COMMAND_CENTER_GRID[layout];
      const taken = new Set<string>();

      for (const id of CARD_IDS) {
        const card = grid.cards[id];

        for (let row = card.rowStart; row < card.rowStart + card.rowSpan; row += 1) {
          for (
            let column = card.columnStart;
            column < card.columnStart + card.columnSpan;
            column += 1
          ) {
            const cell = `${row}:${column}`;

            assert.ok(!taken.has(cell), `${layout} — ${id} hücreyi paylaşıyor: ${cell}`);
            taken.add(cell);
          }
        }
      }
    }
  });

  it("ızgarada boş hücre bırakılmaz", () => {
    for (const layout of ["wide", "medium", "narrow"] as CommandCenterLayout[]) {
      const grid = COMMAND_CENTER_GRID[layout];
      const covered = CARD_IDS.reduce(
        (total, id) => total + grid.cards[id].columnSpan * grid.cards[id].rowSpan,
        0,
      );

      assert.equal(covered, grid.columns * grid.rows, layout);
    }
  });

  it("dar ekranın sırası §3'ün sırasıdır", () => {
    const narrow = COMMAND_CENTER_GRID.narrow.cards;

    assert.deepEqual(
      CARD_IDS.map((id) => [id, narrow[id].rowStart]),
      [
        ["continue", 1],
        ["live", 2],
        ["awaiting", 3],
        ["presence", 4],
        ["upNext", 5],
        ["friends", 6],
      ],
    );
  });

  it("orta kırılımda üst satır Kaldığın yer · Şu an canlı, Arkadaşlar tam genişlik", () => {
    const medium = COMMAND_CENTER_GRID.medium;

    assert.equal(medium.cards.continue.rowStart, 1);
    assert.equal(medium.cards.live.rowStart, 1);
    assert.equal(medium.cards.awaiting.rowSpan, 2);
    assert.equal(medium.cards.friends.columnSpan, medium.columns);
  });

  it("yalnız geniş düzen kaydırmasız", () => {
    assert.equal(COMMAND_CENTER_GRID.wide.scrollable, false);
    assert.equal(COMMAND_CENTER_GRID.medium.scrollable, true);
    assert.equal(COMMAND_CENTER_GRID.narrow.scrollable, true);
  });
});

describe("toGridArea", () => {
  it("satır/kolon sınırlarını CSS kısayoluna çevirir", () => {
    assert.equal(
      toGridArea({ columnSpan: 2, columnStart: 3, rowSpan: 1, rowStart: 1 }),
      "1 / 3 / 2 / 5",
    );
    assert.equal(
      toGridArea({ columnSpan: 1, columnStart: 1, rowSpan: 2, rowStart: 2 }),
      "2 / 1 / 4 / 2",
    );
  });
});

describe("§3 — dar ekranda ölçek motoru ×1'de kalır", () => {
  it("960'ın altındaki her genişlikte adım ×1", () => {
    for (const width of [320, 720, 900, 959]) {
      for (const height of [480, 800, 1200, 2160]) {
        assert.equal(selectUiScale({ height, width }).scale, 1, `${width}×${height}`);
      }
    }
  });

  it("1360'ın altında da ×1'dedir: kompozisyon değişir, ölçek değil", () => {
    assert.equal(selectUiScale({ height: 920, width: 1100 }).scale, 1);
    assert.equal(selectUiScale({ height: 1440, width: 1359 }).scale, 1);
  });
});

describe("buildCommandCenterCss — kırılım CSS'i", () => {
  const css = buildCommandCenterCss();

  it("mobil öncelikli: taban dar düzen, iki medya sorgusu üstüne biner", () => {
    const mediaQueries = [...css.matchAll(/@media \(min-width:(\d+)px\)/g)].map((match) =>
      Number(match[1]),
    );

    assert.deepEqual(mediaQueries, [
      RESPONSIVE_BREAKPOINTS.commandCenter,
      RESPONSIVE_BREAKPOINTS.commandCenterWide,
    ]);
    // Taban blok medya sorgusundan **önce** gelir; dar düzen varsayılandır.
    assert.ok(css.indexOf("grid-template-columns:repeat(1,") < css.indexOf("@media"));
  });

  it("her kırılımın kolon ve satır sayısı tablodan gelir", () => {
    for (const layout of ["narrow", "medium", "wide"] as CommandCenterLayout[]) {
      const grid = COMMAND_CENTER_GRID[layout];

      assert.ok(
        css.includes(
          `grid-template-columns:repeat(${grid.columns},minmax(0,1fr));grid-template-rows:repeat(${grid.rows},auto)`,
        ),
        layout,
      );
    }
  });

  it("altı kartın altısı da üç kırılımda ayrı ayrı yerleştirilmiş", () => {
    const cardIds: CommandCenterCardId[] = [...CARD_IDS];

    for (const id of cardIds) {
      const rules = [
        ...css.matchAll(
          new RegExp(`\\[${COMMAND_CENTER_CARD_ATTRIBUTE}="${id}"\\]\\{grid-area:([^}]+)\\}`, "g"),
        ),
      ].map((match) => match[1]);

      assert.equal(rules.length, 3, id);
      assert.deepEqual(
        rules,
        (["narrow", "medium", "wide"] as CommandCenterLayout[]).map((layout) =>
          toGridArea(COMMAND_CENTER_GRID[layout].cards[id]),
        ),
        id,
      );
    }
  });

  it("kaydırma yalnız geniş düzende kapanır", () => {
    const scrollRules = [
      ...css.matchAll(
        new RegExp(`\\[${COMMAND_CENTER_GRID_ATTRIBUTE}-scroll\\]\\{overflow-y:(\\w+)\\}`, "g"),
      ),
    ].map((match) => match[1]);

    assert.deepEqual(scrollRules, ["auto", "auto", "hidden"]);
  });

  it("`grid-auto-flow` hiç kullanılmaz — sıra açıkça yazılı (§5 tuzağı)", () => {
    assert.doesNotMatch(css, /grid-auto-flow/);
  });
});
