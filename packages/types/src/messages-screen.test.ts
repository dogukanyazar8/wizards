import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BADGE_IDS } from "./badges";
import {
  ConversationToastSchema,
  FRIENDS_TABS,
  InviteCandidatePageSchema,
  PROFILE_MEDIA_PREVIEW_COUNT,
  SetMutedRequestSchema,
  SharedMediaPageSchema,
  UpdatePrivacyRequestSchema,
  UserProfilePanelDTOSchema,
  PROFILE_TINT_ROTATION,
  createInitialMessagesScreenState,
  isMuteActive,
  normalizeFriendsTab,
  reduceMessagesScreen,
  resolveMutedUntil,
  resolveProfileTint,
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

// ---------------------------------------------------------------------------
// §15 profil paneli · §16 üye ekle · §17 menüler ve toast
// ---------------------------------------------------------------------------

describe("durum makinesi — profil paneli (§15)", () => {
  it("profil açılınca thread ve arama kapanır", () => {
    const withThread = reduceMessagesScreen(state({ view: "group" }), {
      messageId: "msg-1",
      type: "openThread",
    });
    assert.equal(withThread.panel, "thread");

    const withProfile = reduceMessagesScreen(withThread, { type: "openProfile" });

    assert.equal(withProfile.panel, "profile");
    assert.equal(withProfile.threadRootId, null);
  });

  it("menü satırı paneli istediği sekmeyle açar", () => {
    const opened = reduceMessagesScreen(state({ view: "group" }), {
      tab: "uyeler",
      type: "openProfile",
    });

    assert.equal(opened.panel, "profile");
    assert.equal(opened.profileTab, "uyeler");
  });

  /** İkinci bir menü satırı paneli kapatmaz; "göster" demek "aç/kapa" değildir. */
  it("ikinci kez açmak paneli kapatmaz", () => {
    const first = reduceMessagesScreen(state({ view: "group" }), {
      tab: "medya",
      type: "openProfile",
    });
    const second = reduceMessagesScreen(first, { tab: "ayarlar", type: "openProfile" });

    assert.equal(second.panel, "profile");
    assert.equal(second.profileTab, "ayarlar");
  });

  it("DM'de üyeler sekmesi seçilemez", () => {
    const opened = reduceMessagesScreen(state({ view: "dm" }), {
      tab: "uyeler",
      type: "openProfile",
    });

    assert.equal(opened.profileTab, "genel");
  });

  it("gruptan DM'e geçince üyeler sekmesi genele düşer", () => {
    const onGroup = reduceMessagesScreen(state({ view: "group" }), {
      tab: "uyeler",
      type: "openProfile",
    });
    const onDm = reduceMessagesScreen(onGroup, { kind: "dm", type: "openConversation" });

    assert.equal(onDm.profileTab, "genel");
  });

  /** §12: "panel durumu sohbet değişince korunur". */
  it("sohbet değişince panel açık kalır, thread kökü ve toast düşer", () => {
    const opened = reduceMessagesScreen(state({ view: "group" }), {
      tab: "medya",
      type: "openProfile",
    });
    const withToast = reduceMessagesScreen(opened, {
      toast: { kind: "archived", tone: "success" },
      type: "showToast",
    });

    const next = reduceMessagesScreen(withToast, { kind: "group", type: "openConversation" });

    assert.equal(next.panel, "profile");
    assert.equal(next.profileTab, "medya");
    assert.equal(next.toast, null);
    assert.equal(next.threadRootId, null);
  });

  it("Arkadaşlar görünümüne geçmek paneli ve sekmeyi sıfırlar", () => {
    const opened = reduceMessagesScreen(state({ view: "group" }), {
      tab: "ayarlar",
      type: "openProfile",
    });
    const next = reduceMessagesScreen(opened, { type: "openFriends" });

    assert.equal(next.panel, null);
    assert.equal(next.profileTab, "genel");
  });

  it("panel kapalıyken sekme değiştirilemez", () => {
    const closed = state({ view: "group" });

    assert.equal(reduceMessagesScreen(closed, { tab: "medya", type: "setProfileTab" }), closed);
  });
});

describe("durum makinesi — başlık menüsü ve sessize alma (§17)", () => {
  it("alt menü yalnız ana menü açıkken açılır", () => {
    const closed = state({ view: "dm" });
    assert.equal(reduceMessagesScreen(closed, { type: "openMuteSubmenu" }), closed);

    const withMenu = reduceMessagesScreen(closed, {
      menu: { kind: "conversationMore" },
      type: "openMenu",
    });
    const withSub = reduceMessagesScreen(withMenu, { type: "openMuteSubmenu" });

    assert.deepEqual(withSub.menu, { kind: "muteSubmenu" });
  });

  it("alt menü ikinci kez basınca ana menüye döner", () => {
    const withSub = reduceMessagesScreen(
      reduceMessagesScreen(state({ view: "dm" }), {
        menu: { kind: "conversationMore" },
        type: "openMenu",
      }),
      { type: "openMuteSubmenu" },
    );

    assert.deepEqual(reduceMessagesScreen(withSub, { type: "openMuteSubmenu" }).menu, {
      kind: "conversationMore",
    });
  });

  it("ray satırı menüsü ile başlık menüsü ayrı kimliklerdir", () => {
    const withRow = reduceMessagesScreen(state({ view: "dm" }), {
      menu: { kind: "conversation" },
      type: "openMenu",
    });
    const withHeader = reduceMessagesScreen(withRow, {
      menu: { kind: "conversationMore" },
      type: "openMenu",
    });

    assert.deepEqual(withHeader.menu, { kind: "conversationMore" });
  });

  it("süre seçimi menüyü kapatır ve sessizliği yazar", () => {
    const withSub = reduceMessagesScreen(
      reduceMessagesScreen(state({ view: "dm" }), {
        menu: { kind: "conversationMore" },
        type: "openMenu",
      }),
      { type: "openMuteSubmenu" },
    );

    const muted = reduceMessagesScreen(withSub, {
      muted: true,
      mutedUntil: "2026-08-27T20:00:00.000Z",
      type: "setMute",
    });

    assert.equal(muted.menu, null);
    assert.equal(muted.muted, true);
    assert.equal(muted.mutedUntil, "2026-08-27T20:00:00.000Z");
  });

  it("sessizliği kaldırmak bitiş anını da siler", () => {
    const muted = reduceMessagesScreen(state({ view: "dm" }), {
      muted: true,
      mutedUntil: "2026-08-27T20:00:00.000Z",
      type: "setMute",
    });
    const cleared = reduceMessagesScreen(muted, { muted: false, type: "setMute" });

    assert.equal(cleared.muted, false);
    assert.equal(cleared.mutedUntil, null);
  });

  it("süresiz sessizlik bitiş anı taşımaz", () => {
    const forever = reduceMessagesScreen(state({ view: "dm" }), { muted: true, type: "setMute" });

    assert.equal(forever.muted, true);
    assert.equal(forever.mutedUntil, null);
  });
});

describe("sessizlik yardımcıları (§17)", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");

  it("süresiz sessizlik her zaman etkindir", () => {
    assert.equal(isMuteActive({ muted: true, mutedUntil: null }, now), true);
  });

  it("süresi geçmiş sessizlik etkin değildir", () => {
    assert.equal(isMuteActive({ muted: true, mutedUntil: "2026-08-27T11:59:00.000Z" }, now), false);
  });

  it("süresi dolmamış sessizlik etkindir", () => {
    assert.equal(isMuteActive({ muted: true, mutedUntil: "2026-08-27T12:01:00.000Z" }, now), true);
  });

  it("muted false ise bitiş anı okunmaz", () => {
    assert.equal(isMuteActive({ muted: false, mutedUntil: null }, now), false);
  });

  it("dört süre doğru bitiş anını üretir", () => {
    assert.equal(resolveMutedUntil("15m", now)?.toISOString(), "2026-08-27T12:15:00.000Z");
    assert.equal(resolveMutedUntil("1h", now)?.toISOString(), "2026-08-27T13:00:00.000Z");
    assert.equal(resolveMutedUntil("8h", now)?.toISOString(), "2026-08-27T20:00:00.000Z");
    assert.equal(resolveMutedUntil("forever", now), null);
  });
});

describe("durum makinesi — üye ekle modalı (§16)", () => {
  it("satır seçimi ekler ve çıkarır", () => {
    const picked = reduceMessagesScreen(state({ view: "group" }), {
      type: "toggleInviteSelection",
      userId: "u1",
    });
    assert.deepEqual(picked.inviteSelection, ["u1"]);

    const cleared = reduceMessagesScreen(picked, {
      type: "toggleInviteSelection",
      userId: "u1",
    });
    assert.deepEqual(cleared.inviteSelection, []);
  });

  it("modal kapanınca seçim düşer", () => {
    const opened = reduceMessagesScreen(state({ view: "group" }), {
      modal: { kind: "invite" },
      type: "openModal",
    });
    const picked = reduceMessagesScreen(opened, {
      type: "toggleInviteSelection",
      userId: "u1",
    });

    assert.deepEqual(reduceMessagesScreen(picked, { type: "closeModal" }).inviteSelection, []);
  });

  it("başka bir modalın kapanması seçimi silmez", () => {
    const picked = reduceMessagesScreen(state({ view: "group" }), {
      type: "toggleInviteSelection",
      userId: "u1",
    });
    const withPoll = reduceMessagesScreen(picked, {
      modal: { kind: "poll" },
      type: "openModal",
    });

    assert.deepEqual(reduceMessagesScreen(withPoll, { type: "closeModal" }).inviteSelection, [
      "u1",
    ]);
  });

  it("bağlantı süresi seçilebilir ve varsayılanı 7 gündür", () => {
    const initial = state();
    assert.equal(initial.inviteLinkExpiry, "7d");

    assert.equal(
      reduceMessagesScreen(initial, { expiry: "never", type: "setInviteLinkExpiry" })
        .inviteLinkExpiry,
      "never",
    );
  });
});

describe("gizlilik ve toast", () => {
  it("gizlilik tercihleri tek tek güncellenir", () => {
    const next = reduceMessagesScreen(state(), {
      privacy: { typingIndicator: false },
      type: "setPrivacy",
    });

    assert.deepEqual(next.privacy, { readReceipts: true, typingIndicator: false });
  });

  it("yeni toast eskisinin yerini alır", () => {
    const first = reduceMessagesScreen(state(), {
      toast: { kind: "archived", tone: "success" },
      type: "showToast",
    });
    const second = reduceMessagesScreen(first, {
      toast: { kind: "muteCleared", tone: "success" },
      type: "showToast",
    });

    assert.equal(second.toast?.kind, "muteCleared");
  });

  it("toast kapatılınca durum yeniden yaratılmaz", () => {
    const empty = state();
    assert.equal(reduceMessagesScreen(empty, { type: "dismissToast" }), empty);
  });

  it("toast şeması varsayılan olarak success tonundadır", () => {
    assert.equal(ConversationToastSchema.parse({ kind: "inviteCopied" }).tone, "success");
  });
});

describe("§15–§16 DTO sözleşmeleri", () => {
  it("profil paneli DM DTO fazladan alan kabul etmez", () => {
    assert.throws(() =>
      UserProfilePanelDTOSchema.parse({
        badges: [],
        bio: null,
        blocked: false,
        friendship: null,
        handle: "selin",
        initials: "SA",
        muted: false,
        mutedUntil: null,
        mutualFriendTotal: 0,
        mutualFriends: [],
        mutualServers: [],
        name: "Selin Aksoy",
        notifyLevel: "ALL",
        presence: "online",
        privacy: { readReceipts: true, typingIndicator: true },
        statusText: null,
        tint: "primary",
        unexpected: true,
        userId: "u1",
      }),
    );
  });

  it("gizlilik güncellemesi boş gövdeyi reddeder", () => {
    assert.throws(() => UpdatePrivacyRequestSchema.parse({}));
    assert.deepEqual(UpdatePrivacyRequestSchema.parse({ readReceipts: false }), {
      readReceipts: false,
    });
  });

  it("eski mute gövdesi geçerli kalır", () => {
    assert.deepEqual(SetMutedRequestSchema.parse({ muted: true }), { muted: true });
    assert.deepEqual(SetMutedRequestSchema.parse({ duration: "8h", muted: true }), {
      duration: "8h",
      muted: true,
    });
  });

  it("medya sayfası gerçek toplamı taşır", () => {
    const page = SharedMediaPageSchema.parse({
      items: [],
      kind: "media",
      nextCursor: null,
      total: 18,
    });

    assert.equal(page.total, 18);
  });

  it("aday sayfası zaten üye olanların sayısını taşır", () => {
    const page = InviteCandidatePageSchema.parse({
      alreadyMemberCount: 5,
      items: [],
      nextCursor: null,
    });

    assert.equal(page.alreadyMemberCount, 5);
  });

  it("rozet paydası sabit değil, katalog uzunluğudur", () => {
    assert.equal(BADGE_IDS.length, 16);
  });

  it("medya önizlemesi ızgaranın tam iki satırıdır", () => {
    assert.equal(PROFILE_MEDIA_PREVIEW_COUNT, 6);
  });
});

describe("kisi tinti (§15.1)", () => {
  it("kimliksiz özne nötr kalır", () => {
    assert.equal(resolveProfileTint(null), "neutral");
    assert.equal(resolveProfileTint(""), "neutral");
  });

  it("aynı kimlik her çağırmada aynı tinti verir", () => {
    const id = "6f3c1b2a-0000-4000-8000-000000000001";
    assert.equal(resolveProfileTint(id), resolveProfileTint(id));
  });

  /** Nötr rotasyonda yok: gerçek bir kişi hiçbir zaman gri DS avatarı almaz. */
  it("gerçek kimlik asla nötr dönmez", () => {
    for (let index = 0; index < 400; index += 1) {
      assert.notEqual(resolveProfileTint(`user-${index}`), "neutral");
    }
  });

  it("dört tintin dördünü de kullanır", () => {
    const seen = new Set<string>();

    for (let index = 0; index < 400; index += 1) {
      seen.add(resolveProfileTint(`user-${index}`));
    }

    assert.deepEqual([...seen].sort(), [...PROFILE_TINT_ROTATION].sort());
  });

  /** `charCodeAt(0)` olsaydı aynı harfle başlayan her ad tek renge düşerdi. */
  it("aynı harfle başlayan kimlikleri tek renge yığmaz", () => {
    const seen = new Set<string>();

    for (const suffix of ["aa", "ab", "ac", "ad", "ae", "af", "ag", "ah"]) {
      seen.add(resolveProfileTint(`a${suffix}`));
    }

    assert.ok(seen.size > 1);
  });
});

describe("sag yuvanin tek sahibi (§2 / K5)", () => {
  /**
   * Thread ve arama sohbet yüzeyinin kendi durumunda, profil paneli bu makinede.
   * İkisi de yuvayı elinde sanarsa ikisi de çizer: 340 + 330, 1360'ta ana alana
   * 60px bırakır — sözlük 390 istiyor. Sayacın işi o çakışmayı imkânsız kılmak.
   */
  it("profil açıldıkça kapatma sinyali artar", () => {
    const first = reduceMessagesScreen(state({ view: "group" }), { type: "openProfile" });
    assert.equal(first.sidePanelCloseRequestId, 1);

    const second = reduceMessagesScreen(first, { tab: "medya", type: "openProfile" });
    assert.equal(second.sidePanelCloseRequestId, 2);
  });

  it("sekme değiştirmek sinyali arttırmaz", () => {
    const opened = reduceMessagesScreen(state({ view: "group" }), { type: "openProfile" });
    const tabbed = reduceMessagesScreen(opened, { tab: "ayarlar", type: "setProfileTab" });

    assert.equal(tabbed.sidePanelCloseRequestId, opened.sidePanelCloseRequestId);
  });

  it("thread açmak profili yuvadan düşürür", () => {
    const opened = reduceMessagesScreen(state({ view: "group" }), { type: "openProfile" });
    const threaded = reduceMessagesScreen(opened, { messageId: "m1", type: "openThread" });

    assert.equal(threaded.panel, "thread");
  });
});
