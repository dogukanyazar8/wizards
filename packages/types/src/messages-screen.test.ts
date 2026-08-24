import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FRIENDS_TABS,
  createInitialMessagesScreenState,
  normalizeFriendsTab,
  reduceMessagesScreen,
  selectQuickStart,
  type MessagesScreenState,
} from "./messages-screen";

function state(overrides: Partial<MessagesScreenState> = {}): MessagesScreenState {
  return createInitialMessagesScreenState(overrides);
}

describe("durum makinesi — paneller", () => {
  /** §10 kabul kriteri: aynı anda iki panel açık kalmaz. */
  it("thread ve arama aynı anda açılmaz", () => {
    const withThread = reduceMessagesScreen(state({ view: "group" }), {
      panel: "thread",
      type: "togglePanel",
    });
    assert.equal(withThread.panel, "thread");

    const withSearch = reduceMessagesScreen(withThread, { panel: "search", type: "togglePanel" });
    assert.equal(withSearch.panel, "search");
  });

  it("açık panelin ikonu paneli kapatır", () => {
    const opened = reduceMessagesScreen(state(), { panel: "search", type: "togglePanel" });

    assert.equal(
      reduceMessagesScreen(opened, { panel: "search", type: "togglePanel" }).panel,
      null,
    );
  });

  it("thread panelinden aramaya geçince kök mesaj bırakılır", () => {
    const opened = reduceMessagesScreen(state(), { messageId: "msg-1", type: "openThread" });
    assert.equal(opened.threadRootId, "msg-1");

    const searching = reduceMessagesScreen(opened, { panel: "search", type: "togglePanel" });
    assert.equal(searching.panel, "search");
    assert.equal(searching.threadRootId, null);
  });

  it("Arkadaşlar'a dönmek panelleri kapatır", () => {
    // Panel bir sohbete aittir; sohbetten çıkınca dayanağı kalmaz.
    const opened = reduceMessagesScreen(state({ view: "dm" }), {
      messageId: "msg-1",
      type: "openThread",
    });

    const friends = reduceMessagesScreen(opened, { type: "openFriends" });
    assert.equal(friends.panel, null);
    assert.equal(friends.threadRootId, null);
  });

  it("sohbet değişince panel durumu korunur", () => {
    // §12: "panel durumu sohbet değişince korunur".
    const opened = reduceMessagesScreen(state({ view: "dm" }), {
      panel: "search",
      type: "togglePanel",
    });

    const next = reduceMessagesScreen(opened, { kind: "group", type: "openConversation" });
    assert.equal(next.panel, "search");
  });
});

describe("durum makinesi — menüler", () => {
  /** §10 kabul kriteri: aynı anda iki menü açık kalmaz. */
  it("ikinci menü birincisinin yerini alır", () => {
    const first = reduceMessagesScreen(state(), {
      menu: { id: "friend-1", kind: "friendRow" },
      type: "openMenu",
    });
    const second = reduceMessagesScreen(first, {
      menu: { id: "friend-2", kind: "friendRow" },
      type: "openMenu",
    });

    assert.deepEqual(second.menu, { id: "friend-2", kind: "friendRow" });
  });

  it("aynı tetikleyici menüyü kapatır", () => {
    const opened = reduceMessagesScreen(state(), {
      menu: { id: "friend-1", kind: "friendRow" },
      type: "openMenu",
    });

    assert.equal(
      reduceMessagesScreen(opened, {
        menu: { id: "friend-1", kind: "friendRow" },
        type: "openMenu",
      }).menu,
      null,
    );
  });

  it("farklı türden menüler de tek yuvayı paylaşır", () => {
    const rowMenu = reduceMessagesScreen(state(), {
      menu: { id: "msg-1", kind: "message" },
      type: "openMenu",
    });
    const sortMenu = reduceMessagesScreen(rowMenu, {
      menu: { kind: "friendsSort" },
      type: "openMenu",
    });

    assert.deepEqual(sortMenu.menu, { kind: "friendsSort" });
  });

  /**
   * Menü onu açan satıra tutturulur; ekranda ne varsa değiştiren her geçiş onu
   * hiçliği gösterir hâle bırakır. Bunu her çağırana bırakmak, kuralın
   * unutulacağı beş yer demektir.
   */
  it("her geçiş menüyü kapatır", () => {
    const withMenu = state({ menu: { id: "friend-1", kind: "friendRow" }, view: "friends" });

    for (const action of [
      { kind: "dm", type: "openConversation" },
      { type: "openFriends" },
      { type: "openEmpty" },
      { tab: "pending", type: "setTab" },
      { panel: "thread", type: "togglePanel" },
      { messageId: "msg-1", type: "openThread" },
      { type: "closePanel" },
      { modal: { kind: "poll" }, type: "openModal" },
      { type: "closeModal" },
    ] as const) {
      assert.equal(
        reduceMessagesScreen(withMenu, action).menu,
        null,
        `${action.type} menüyü kapatmadı`,
      );
    }
  });

  it("menü yokken kapatma aynı nesneyi döndürür", () => {
    const initial = state();

    assert.equal(reduceMessagesScreen(initial, { type: "closeMenu" }), initial);
  });
});

describe("durum makinesi — modallar", () => {
  it("grup modalı adımlar arasında gezinir", () => {
    const opened = reduceMessagesScreen(state(), {
      modal: { kind: "group", step: 1 },
      type: "openModal",
    });
    const second = reduceMessagesScreen(opened, { step: 2, type: "setGroupStep" });

    assert.deepEqual(second.modal, { kind: "group", step: 2 });
  });

  it("adım değişimi yalnız grup modalında geçerlidir", () => {
    const poll = reduceMessagesScreen(state(), { modal: { kind: "poll" }, type: "openModal" });

    assert.equal(reduceMessagesScreen(poll, { step: 2, type: "setGroupStep" }), poll);
  });

  it("modal paneli kapatmaz", () => {
    // Anket modalı bir sohbetin üstünde açılır; kapanınca arkasındaki panel
    // hâlâ orada olmalı.
    const withPanel = reduceMessagesScreen(state({ view: "group" }), {
      panel: "search",
      type: "togglePanel",
    });
    const withModal = reduceMessagesScreen(withPanel, {
      modal: { kind: "poll" },
      type: "openModal",
    });

    assert.equal(withModal.panel, "search");
    assert.equal(reduceMessagesScreen(withModal, { type: "closeModal" }).panel, "search");
  });
});

describe("biçimlendirme şeridi", () => {
  it("açılıp kapanır ve sohbet değişince korunur", () => {
    const open = reduceMessagesScreen(state(), { type: "toggleFormatting" });
    assert.equal(open.formattingOpen, true);

    const nextConversation = reduceMessagesScreen(open, {
      kind: "group",
      type: "openConversation",
    });
    assert.equal(nextConversation.formattingOpen, true);
    assert.equal(reduceMessagesScreen(open, { type: "toggleFormatting" }).formattingOpen, false);
  });
});

describe("sekmeler", () => {
  it("dört sekme çizilir", () => {
    assert.deepEqual([...FRIENDS_TABS], ["all", "add", "pending", "blocked"]);
  });

  it("eski ?dmTab=online bağlantısı Tümü'ye düşer", () => {
    // Eski bağlantı bir hata değil; aynı kişileri bir başlık altında gösterir.
    assert.equal(normalizeFriendsTab("online"), "all");
    assert.equal(normalizeFriendsTab(null), "all");
    assert.equal(normalizeFriendsTab("uydurma"), "all");
    assert.equal(normalizeFriendsTab("blocked"), "blocked");
  });
});

describe("hızlı başla (karar #12)", () => {
  const rows = [
    { id: "c1", pinned: false },
    { id: "c2", pinned: true },
    { id: "c3", pinned: false },
    { id: "c4", pinned: true },
  ];

  it("önce sabitlenenleri, sonra sırayı alır", () => {
    assert.deepEqual(
      selectQuickStart(rows).map((row) => row.id),
      ["c2", "c4", "c1"],
    );
  });

  it("aynı sohbeti iki kez göstermez", () => {
    const picked = selectQuickStart(rows);

    assert.equal(new Set(picked.map((row) => row.id)).size, picked.length);
  });

  it("veri yetmezse kısmi liste verir", () => {
    assert.equal(selectQuickStart([{ id: "c1", pinned: false }]).length, 1);
  });

  it("hiç sohbet yoksa boş döner ve şerit hiç çizilmez", () => {
    assert.deepEqual(selectQuickStart([]), []);
  });
});
