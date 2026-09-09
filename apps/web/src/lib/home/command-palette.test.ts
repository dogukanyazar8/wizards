import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMAND_PALETTE_DEBOUNCE_MS,
  HOME_COMMAND_ACTIONS,
  buildPaletteSections,
  buildPaletteTabs,
  filterPaletteSections,
  isCommandPaletteShortcut,
  moveActiveRow,
  parseCommandPaletteQuery,
  selectCommandActions,
  shouldShowPaletteRateLimit,
} from "@/lib/home/command-palette";
import { interpolateMessage, resolveMessageTemplate } from "@/lib/locale/core";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import type { SearchCommandResponse } from "@/lib/home/types";

/**
 * Faz 7: etiketler sözlükten. Arama, kullanıcının **gördüğü** metinde yapılıyor, o yüzden
 * testler de gerçek `tr.ts` ile koşuyor — sahte bir sözlük "ODAK" aramasının Türkçe metin
 * üzerinde çalıştığını kanıtlamazdı.
 */
const translate = (key: string, values?: Record<string, number | string>) =>
  interpolateMessage(resolveMessageTemplate(TR_MESSAGES, key, values), values);

/**
 * `06-faz5` §5. The palette's decisions, separated from its markup: what is
 * listed, in what order, what the arrow keys land on, and which hrefs are
 * allowed to become links.
 */

const RESULTS: SearchCommandResponse = {
  groups: [
    {
      items: [
        {
          avatarUrl: null,
          href: "/channels/s1/c1",
          id: "c1",
          label: "genel",
          presence: null,
          sublabel: "Wizards",
        },
      ],
      kind: "channel",
    },
    {
      items: [
        {
          avatarUrl: null,
          href: "/messages/friends?user=u1",
          id: "u1",
          label: "Selin",
          presence: "ONLINE",
          sublabel: "selin",
        },
      ],
      kind: "user",
    },
  ],
};

describe("isCommandPaletteShortcut", () => {
  it("accepts ⌘K and Ctrl+K", () => {
    assert.equal(isCommandPaletteShortcut({ key: "k", metaKey: true }), true);
    assert.equal(isCommandPaletteShortcut({ key: "K", ctrlKey: true }), true);
  });

  it("ignores a bare k and other modifier mixes", () => {
    assert.equal(isCommandPaletteShortcut({ key: "k" }), false);
    assert.equal(isCommandPaletteShortcut({ key: "j", metaKey: true }), false);
    assert.equal(isCommandPaletteShortcut({ key: "k", altKey: true, metaKey: true }), false);
  });

  it("does not fire while the user is typing somewhere else", () => {
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "TEXTAREA" },
      { tagName: "SELECT" },
      { isContentEditable: true, tagName: "DIV" },
    ]) {
      assert.equal(isCommandPaletteShortcut({ key: "k", metaKey: true, target }), false);
    }
  });

  it("still fires from the palette's own input, so a second press can close it", () => {
    assert.equal(
      isCommandPaletteShortcut({
        key: "k",
        metaKey: true,
        target: { dataset: { commandPaletteInput: "true" }, tagName: "INPUT" },
      }),
      true,
    );
  });
});

describe("selectCommandActions", () => {
  it("her komutun etiketi sözlükte var", () => {
    for (const action of HOME_COMMAND_ACTIONS) {
      assert.ok(action.labelKey in TR_MESSAGES, action.labelKey);

      if (action.sublabelKey !== null) {
        assert.ok(action.sublabelKey in TR_MESSAGES, action.sublabelKey);
      }
    }
  });

  it("lists the seven static commands, minus the focus branch that does not apply", () => {
    // Faz 6 added `Etkinliklere git` once `/events` became a real screen. Ayarlar Ş13
    // dropped `nav:inbox` with the `/inbox` route (K10); `/mentions` is the full list.
    assert.equal(HOME_COMMAND_ACTIONS.length, 7);

    const closed = selectCommandActions({ focusActive: false, query: "", translate });
    const open = selectCommandActions({ focusActive: true, query: "", translate });

    assert.equal(closed.length, 6);
    assert.equal(open.length, 6);
    assert.ok(closed.some((action) => action.id === "focus:start"));
    assert.ok(!closed.some((action) => action.id === "focus:stop"));
    assert.ok(open.some((action) => action.id === "focus:stop"));
    assert.ok(!open.some((action) => action.id === "focus:start"));
  });

  it("filters on the label, case- and diacritic-insensitively", () => {
    const matches = selectCommandActions({ focusActive: false, query: "ODAK", translate });

    assert.deepEqual(
      matches.map((action) => action.id),
      ["focus:start"],
    );
  });

  it("only offers navigation to routes the app actually declares", () => {
    for (const action of HOME_COMMAND_ACTIONS) {
      if (action.href) {
        assert.ok(action.href.startsWith("/"), action.id);
        assert.ok(!action.href.startsWith("//"), action.id);
      }
    }
  });
});

describe("parseCommandPaletteQuery", () => {
  it("baştaki > işaretini komut modu olarak ayırır ve sunucu aramasına göndermez", () => {
    assert.deepEqual(parseCommandPaletteQuery("  >  odak"), {
      commandMode: true,
      searchTerm: "odak",
    });
  });

  it("normal sorguyu yalnız dış boşluklarından arındırır", () => {
    assert.deepEqual(parseCommandPaletteQuery("  tasarım  "), {
      commandMode: false,
      searchTerm: "tasarım",
    });
  });
});

describe("shouldShowPaletteRateLimit", () => {
  it("cached 429 yerel Komutlar ve Etkinlikler sekmelerini kapatmaz", () => {
    assert.equal(
      shouldShowPaletteRateLimit({ commandMode: true, isRateLimited: true, tab: "command" }),
      false,
    );
    assert.equal(
      shouldShowPaletteRateLimit({ commandMode: false, isRateLimited: true, tab: "command" }),
      false,
    );
    assert.equal(
      shouldShowPaletteRateLimit({ commandMode: false, isRateLimited: true, tab: "event" }),
      false,
    );
  });

  it("429 yalnız uzak sonuç kullanan sekmelerde bildirilir", () => {
    for (const tab of ["all", "channel", "user", "dm"] as const) {
      assert.equal(
        shouldShowPaletteRateLimit({ commandMode: false, isRateLimited: true, tab }),
        true,
      );
    }
    assert.equal(
      shouldShowPaletteRateLimit({ commandMode: false, isRateLimited: false, tab: "all" }),
      false,
    );
  });
});

describe("buildPaletteSections", () => {
  it("referans sırasını korur: komutlar, kanallar, kişiler, mesajlar", () => {
    const sections = buildPaletteSections({
      actions: selectCommandActions({ focusActive: false, query: "", translate }),
      results: {
        groups: [
          {
            items: [
              {
                avatarUrl: null,
                href: "/messages/d1",
                id: "d1",
                label: "Selin",
                presence: "ONLINE",
                sublabel: null,
              },
            ],
            kind: "dm",
          },
          ...RESULTS.groups,
        ],
      },
      translate,
    });

    assert.deepEqual(
      sections.map((section) => section.kind),
      ["command", "channel", "user", "dm"],
    );
  });

  it("drops a result whose href is not an in-app path", () => {
    const sections = buildPaletteSections({
      actions: [],
      results: {
        groups: [
          {
            items: [
              {
                avatarUrl: null,
                href: "https://evil.example",
                id: "x",
                label: "Dış",
                presence: null,
                sublabel: null,
              },
              {
                avatarUrl: null,
                href: "//evil.example",
                id: "y",
                label: "Protokolsüz",
                presence: null,
                sublabel: null,
              },
              {
                avatarUrl: null,
                href: "/channels/s1/c1",
                id: "c1",
                label: "genel",
                presence: null,
                sublabel: null,
              },
            ],
            kind: "channel",
          },
        ],
      },
      translate,
    });

    assert.deepEqual(
      sections.flatMap((section) => section.rows.map((row) => row.id)),
      ["channel:c1"],
    );
  });

  it("gives every row a unique id so aria-activedescendant can name one", () => {
    const sections = buildPaletteSections({
      actions: selectCommandActions({ focusActive: false, query: "", translate }),
      results: RESULTS,
      translate,
    });
    const ids = sections.flatMap((section) => section.rows.map((row) => row.id));

    assert.equal(new Set(ids).size, ids.length);
  });

  it("returns nothing at all when there is nothing to list", () => {
    assert.deepEqual(buildPaletteSections({ actions: [], results: { groups: [] }, translate }), []);
  });
});

describe("palette tabs", () => {
  const sections = buildPaletteSections({
    actions: selectCommandActions({ focusActive: false, query: "", translate }),
    results: {
      groups: [
        ...RESULTS.groups,
        {
          items: [
            {
              avatarUrl: null,
              href: "/messages/d1",
              id: "d1",
              label: "Mert",
              presence: "IDLE",
              sublabel: null,
            },
          ],
          kind: "dm",
        },
      ],
    },
    translate,
  });

  it("altı referans sekmesini gerçek görünür satır sayılarıyla üretir", () => {
    assert.deepEqual(
      buildPaletteTabs(sections, translate).map(({ count, id }) => ({ count, id })),
      [
        { count: 9, id: "all" },
        { count: 6, id: "command" },
        { count: 1, id: "channel" },
        { count: 1, id: "user" },
        { count: 1, id: "dm" },
        { count: 1, id: "event" },
      ],
    );
  });

  it("Etkinlikler sekmesinde yalnız güvenli mevcut etkinlik komutunu gösterir", () => {
    const filtered = filterPaletteSections(sections, "event", translate);

    assert.deepEqual(
      filtered.flatMap((section) => section.rows.map((row) => row.actionId)),
      ["nav:events"],
    );
  });
});

describe("moveActiveRow", () => {
  const rows = ["a", "b", "c"];

  it("walks down and wraps to the top", () => {
    assert.equal(moveActiveRow(rows, "a", 1), "b");
    assert.equal(moveActiveRow(rows, "c", 1), "a");
  });

  it("walks up and wraps to the bottom", () => {
    assert.equal(moveActiveRow(rows, "a", -1), "c");
    assert.equal(moveActiveRow(rows, "b", -1), "a");
  });

  it("starts at the first row when nothing is active yet or the row vanished", () => {
    assert.equal(moveActiveRow(rows, null, 1), "a");
    assert.equal(moveActiveRow(rows, "gone", -1), "a");
  });

  it("has nothing to move to in an empty list", () => {
    assert.equal(moveActiveRow([], "a", 1), null);
  });
});

describe("debounce", () => {
  it("is the 200 ms §5.2 asks for", () => {
    assert.equal(COMMAND_PALETTE_DEBOUNCE_MS, 200);
  });
});
