import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AppNotificationGroup, NotifUnreadCounts } from "@wizards/types";

import {
  EMPTY_NOTIF_COUNTS,
  NOTIF_KIND_GLYPH,
  NOTIF_KIND_TONE,
  NOTIF_PANEL_TABS,
  applyNotifReadAll,
  applyNotifReadFlag,
  createNotifPanelState,
  flattenNotifPages,
  hasVisibleNotifCount,
  isNotifListEmpty,
  mergeNotifCounts,
  nextNotifPanelTab,
  notifPanelReducer,
  resolveNotifPanelEscape,
  selectNotifCountsFromPages,
  selectNotifTabCount,
} from "./panel-state";
import type { NotificationPageDTO } from "./types";

/**
 * Ş11 — panelin ve 560 px pencerenin kararları.
 *
 * Bu depoda web testlerinin DOM'u yok, o yüzden "dişli paneli kapatıp pencereyi açar",
 * "kırmızı 0 pili görünmez" ve "istemci sayacı artırmaz" gibi kabul maddeleri burada, saf
 * fonksiyonlar üzerinde sabitlenir.
 */

function counts(partial: Partial<NotifUnreadCounts> = {}): NotifUnreadCounts {
  return { ...EMPTY_NOTIF_COUNTS, ...partial };
}

function page(overrides: Partial<NotificationPageDTO> = {}): NotificationPageDTO {
  return {
    counts: counts(),
    groups: [],
    nextCursor: null,
    tab: "all",
    ...overrides,
  };
}

function group(
  label: AppNotificationGroup["label"],
  items: readonly { id: string; read: boolean }[],
): AppNotificationGroup {
  return {
    items: items.map((item) => ({
      body: `body-${item.id}`,
      createdAt: "2026-08-24T09:41:00.000Z",
      id: item.id,
      kind: "mention" as const,
      read: item.read,
      title: `title-${item.id}`,
    })),
    label,
  };
}

describe("notifPanelReducer — tek panel, tek modal", () => {
  it("zil paneli açar ve kapatır", () => {
    const opened = notifPanelReducer(createNotifPanelState(), { type: "togglePanel" });
    assert.equal(opened.surface, "panel");

    const closed = notifPanelReducer(opened, { type: "togglePanel" });
    assert.equal(closed.surface, "closed");
  });

  it("dişli paneli kapatıp pencereyi açar — ikisi aynı anda açık kalmaz", () => {
    const opened = notifPanelReducer(createNotifPanelState(), { type: "openPanel" });
    const prefs = notifPanelReducer(opened, { type: "openPrefs" });

    assert.equal(prefs.surface, "prefs");
  });

  it("modal açıkken zil ikisini birden açmaz", () => {
    const prefs = notifPanelReducer(createNotifPanelState(), { type: "openPrefs" });
    const toggled = notifPanelReducer(prefs, { type: "togglePanel" });

    assert.equal(toggled.surface, "closed");
  });

  it("`Esc` basamağı önce modalı, sonra paneli adlandırır", () => {
    const closed = createNotifPanelState();
    assert.equal(resolveNotifPanelEscape(closed), "none");

    const panel = notifPanelReducer(closed, { type: "openPanel" });
    assert.equal(resolveNotifPanelEscape(panel), "panel");

    const prefs = notifPanelReducer(panel, { type: "openPrefs" });
    assert.equal(resolveNotifPanelEscape(prefs), "prefs");
    assert.equal(notifPanelReducer(prefs, { type: "escape" }).surface, "closed");
  });

  it("kapanış kayıt göstergesini `idle`a döndürür — yeniden açılışta `Kaydedildi` yazmaz", () => {
    const saved = notifPanelReducer(
      notifPanelReducer(createNotifPanelState(), { type: "openPrefs" }),
      { save: "saved", type: "save" },
    );
    assert.equal(saved.save, "saved");

    const reopened = notifPanelReducer(notifPanelReducer(saved, { type: "closeAll" }), {
      type: "openPrefs",
    });
    assert.equal(reopened.save, "idle");
  });

  it("aynı geçiş aynı nesneyi döndürür", () => {
    const state = notifPanelReducer(createNotifPanelState(), { type: "openPanel" });

    assert.equal(notifPanelReducer(state, { type: "openPanel" }), state);
    assert.equal(notifPanelReducer(state, { tab: "all", type: "selectTab" }), state);
  });
});

describe("sekme gezinmesi", () => {
  it("dört sekmeyi SPEC sırasında taşır", () => {
    assert.deepEqual([...NOTIF_PANEL_TABS], ["all", "mentions", "replies", "system"]);
  });

  it("`←/→` uçlarda sarar", () => {
    assert.equal(nextNotifPanelTab("all", -1), "system");
    assert.equal(nextNotifPanelTab("system", 1), "all");
    assert.equal(nextNotifPanelTab("mentions", 1), "replies");
  });

  it("sekme sayacını kendi dalından okur", () => {
    const value = counts({ all: 3, mentions: 2, replies: 1, system: 0 });

    assert.equal(selectNotifTabCount(value, "all"), 3);
    assert.equal(selectNotifTabCount(value, "mentions"), 2);
    assert.equal(selectNotifTabCount(value, "replies"), 1);
    assert.equal(selectNotifTabCount(value, "system"), 0);
  });
});

describe("sayaçlar", () => {
  it("kırmızı `0` pili hiçbir durumda görünmez", () => {
    assert.equal(hasVisibleNotifCount(0), false);
    assert.equal(hasVisibleNotifCount(-1), false);
    assert.equal(hasVisibleNotifCount(1), true);
  });

  it("istemci sayacı artırmaz — soket yükü sayaç taşımıyorsa eldeki korunur", () => {
    const current = counts({ all: 3, mentions: 2 });

    assert.equal(mergeNotifCounts(current, undefined), current);
    assert.deepEqual(mergeNotifCounts(current, counts({ all: 4, mentions: 3 })), {
      all: 4,
      mentions: 3,
      replies: 0,
      system: 0,
    });
  });

  it("sayfaların sayacı son yanıtınkidir", () => {
    const pages = [page({ counts: counts({ all: 9 }) }), page({ counts: counts({ all: 4 }) })];

    assert.equal(selectNotifCountsFromPages(pages).all, 4);
    assert.deepEqual(selectNotifCountsFromPages(undefined), EMPTY_NOTIF_COUNTS);
  });
});

describe("liste", () => {
  it("satırın okundu bayrağını çevirir, sayaca dokunmaz", () => {
    const groups = [
      group("today", [
        { id: "n1", read: false },
        { id: "n2", read: false },
      ]),
    ];
    const next = applyNotifReadFlag(groups, "n1", true);

    assert.equal(next[0]?.items[0]?.read, true);
    assert.equal(next[0]?.items[1]?.read, false);
    // Girdi değişmedi: önbellek yazımı yeni nesne üretmeliydi.
    assert.equal(groups[0]?.items[0]?.read, false);
  });

  it("`Tümünü okundu işaretle` sayfadaki her satırı okur", () => {
    const groups = [
      group("today", [{ id: "n1", read: false }]),
      group("yesterday", [
        { id: "n2", read: false },
        { id: "n3", read: true },
      ]),
    ];

    const next = applyNotifReadAll(groups);

    assert.deepEqual(
      next.flatMap((entry) => entry.items.map((item) => item.read)),
      [true, true, true],
    );
  });

  it("boş durumu satır sayısından okur, grup sayısından değil", () => {
    assert.equal(isNotifListEmpty([]), true);
    assert.equal(isNotifListEmpty([group("today", [])]), true);
    assert.equal(isNotifListEmpty([group("today", [{ id: "n1", read: false }])]), false);
  });

  it("sayfaları kova sırasını bozmadan birleştirir", () => {
    const pages = [
      page({
        groups: [
          group("today", [{ id: "n1", read: false }]),
          group("yesterday", [{ id: "n2", read: true }]),
        ],
      }),
      page({ groups: [group("yesterday", [{ id: "n3", read: true }])] }),
    ];

    const merged = flattenNotifPages(pages);

    assert.deepEqual(
      merged.map((entry) => entry.label),
      ["today", "yesterday"],
    );
    assert.deepEqual(
      merged[1]?.items.map((item) => item.id),
      ["n2", "n3"],
    );
  });
});

describe("tür ikonu", () => {
  it("dört kovanın harfini ve token adını taşır", () => {
    assert.deepEqual(NOTIF_KIND_GLYPH, { event: "E", mention: "@", reply: "T", system: "S" });
    assert.deepEqual(NOTIF_KIND_TONE, {
      event: "--warning",
      mention: "--primary",
      reply: "--success",
      system: "--text-muted",
    });
  });

  it("ton kaydı renk değil token adı taşır", () => {
    for (const tone of Object.values(NOTIF_KIND_TONE)) {
      assert.ok(tone.startsWith("--"), tone);
    }
  });
});
