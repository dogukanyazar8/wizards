import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MENTIONS_UI_INITIAL_STATE,
  MENTION_SETTINGS_DEFAULTS,
  MentionCountsSchema,
  MentionFilterSchema,
  MentionListResponseSchema,
  MentionSchema,
  MentionSettingsPatchSchema,
  MentionSettingsSchema,
  MentionSourceSchema,
  MentionWindowSchema,
  QuietHourTimeSchema,
  formatMentionId,
  mentionsUiReducer,
  parseMentionId,
  type MentionsUiState,
} from "./mentions-screen";

function mention(overrides: Record<string, unknown> = {}) {
  return {
    id: "channel:m-1",
    messageId: "message-1",
    stateKey: { source: "channel", refId: "m-1" },
    author: { id: "u-1", name: "Selin Aksoy", handle: "selin", initials: "SA" },
    kind: "me",
    tag: "@Doğukan Yazar",
    body: "kart yoğunluğu kararını bugünkü kritiğe alalım mı?",
    createdAt: "2026-08-21T09:41:00.000Z",
    unread: true,
    readLater: false,
    source: {
      type: "channel",
      serverId: "s-1",
      serverName: "Whispr Topluluğu",
      serverInitial: "W",
      channelId: "c-1",
      channelName: "tasarım-kritiği",
    },
    href: "/channels/s-1/c-1?message=m-1",
    permalink: "https://whispr.app/channels/s-1/c-1?message=m-1",
    ...overrides,
  };
}

describe("mentions-screen — şemalar", () => {
  it("dört türü tanır ve beşinciyi reddeder", () => {
    assert.ok(MentionSchema.safeParse(mention({ kind: "role" })).success);
    assert.ok(MentionSchema.safeParse(mention({ kind: "everyone" })).success);
    assert.ok(MentionSchema.safeParse(mention({ kind: "thread" })).success);
    assert.ok(!MentionSchema.safeParse(mention({ kind: "here" })).success);
  });

  it("yanıt hedefi için gerçek messageId taşır", () => {
    const parsed = MentionSchema.parse(mention());
    assert.equal(parsed.messageId, "message-1");
    assert.ok(!MentionSchema.safeParse(mention({ messageId: undefined })).success);
  });

  it("liste kesin toplamı ve seçili kaynak başlığını taşır", () => {
    const parsed = MentionListResponseSchema.parse({
      items: [mention()],
      nextCursor: null,
      sourceTitle: "Whispr Topluluğu",
      total: 1,
    });

    assert.equal(parsed.total, 1);
    assert.equal(parsed.sourceTitle, "Whispr Topluluğu");
  });

  it("kaynak birliği ayrık: kanal alanları DM'de aranmaz", () => {
    const dm = MentionSourceSchema.safeParse({
      type: "dm",
      conversationId: "conv-1",
      title: "Zeynep Arı",
    });
    assert.ok(dm.success);

    // Kanal dalı sunucu kimliği olmadan geçerli olamaz.
    const broken = MentionSourceSchema.safeParse({ type: "channel", channelId: "c-1" });
    assert.ok(!broken.success);
  });

  it("createdAt ofsetli ISO ister", () => {
    assert.ok(!MentionSchema.safeParse(mention({ createdAt: "21.08.2026 09:41" })).success);
  });

  it("sayaçlar negatif olamaz", () => {
    const counts = {
      all: 7,
      unread: 2,
      me: 3,
      role: 3,
      everyone: 1,
      thread: 1,
      readLater: 0,
      roleNames: ["tasarım", "ürün"],
      bySource: { "s-1": 3, dm: 2 },
    };

    assert.ok(MentionCountsSchema.safeParse(counts).success);
    assert.deepEqual(MentionCountsSchema.parse(counts).roleNames, ["tasarım", "ürün"]);
    assert.ok(!MentionCountsSchema.safeParse({ ...counts, unread: -1 }).success);
  });

  it("filtre ve pencere değerleri SPEC §2 ile aynı", () => {
    assert.deepEqual(MentionFilterSchema.options, ["all", "unread", "role", "dm", "me", "thread"]);
    assert.deepEqual(MentionWindowSchema.options, ["30d", "all"]);
  });
});

describe("mentions-screen — ayarlar", () => {
  it("varsayılanlar SPEC §7 tablosunu taşır", () => {
    assert.ok(MentionSettingsSchema.safeParse(MENTION_SETTINGS_DEFAULTS).success);
    assert.equal(MENTION_SETTINGS_DEFAULTS.threadReplies, false);
    assert.equal(MENTION_SETTINGS_DEFAULTS.desktop, "mentions");
  });

  it("sessiz saat HH:mm ister", () => {
    assert.ok(QuietHourTimeSchema.safeParse("23:00").success);
    assert.ok(QuietHourTimeSchema.safeParse("08:00").success);
    assert.ok(!QuietHourTimeSchema.safeParse("24:00").success);
    assert.ok(!QuietHourTimeSchema.safeParse("8:00").success);
    assert.ok(!QuietHourTimeSchema.safeParse("23.00").success);
  });

  it("kısmi güncelleme bilinmeyen alanı reddeder", () => {
    assert.ok(MentionSettingsPatchSchema.safeParse({ threadReplies: true }).success);
    assert.ok(!MentionSettingsPatchSchema.safeParse({ threadRepliez: true }).success);
  });
});

describe("mentions-screen — kimlik yazımı", () => {
  it("yazar ve çözer", () => {
    const key = { source: "everyone", refId: "msg-9" } as const;

    assert.equal(formatMentionId(key), "everyone:msg-9");
    assert.deepEqual(parseMentionId("everyone:msg-9"), key);
  });

  it("referansındaki ayracı korur", () => {
    assert.deepEqual(parseMentionId("dm:a:b"), { source: "dm", refId: "a:b" });
  });

  it("tanınmayan kaynağa düşmez", () => {
    assert.equal(parseMentionId("uydurma:1"), null);
    assert.equal(parseMentionId("channel:"), null);
    assert.equal(parseMentionId(":m-1"), null);
    assert.equal(parseMentionId("channel"), null);
    assert.equal(parseMentionId(null), null);
  });
});

describe("mentions-screen — durum disiplini (SPEC §2)", () => {
  const open: MentionsUiState = {
    menu: "a",
    reply: "b",
    panel: "c",
    settingsOpen: false,
    cursor: "b",
  };

  it("yanıt açılırken menü kapanır", () => {
    const next = mentionsUiReducer(open, { type: "toggleReply", id: "z" });

    assert.equal(next.reply, "z");
    assert.equal(next.menu, null);
  });

  it("panel açılırken menü kapanır ve imleç karta iner", () => {
    const next = mentionsUiReducer(open, { type: "togglePanel", id: "z" });

    assert.equal(next.panel, "z");
    assert.equal(next.menu, null);
    assert.equal(next.cursor, "z");
  });

  it("aynı karta ikinci basış kapatır", () => {
    assert.equal(mentionsUiReducer(open, { type: "togglePanel", id: "c" }).panel, null);
    assert.equal(mentionsUiReducer(open, { type: "toggleReply", id: "b" }).reply, null);
    assert.equal(mentionsUiReducer(open, { type: "toggleMenu", id: "a" }).menu, null);
  });

  it("modal açılırken menü ve yanıt kapanır", () => {
    const next = mentionsUiReducer(open, { type: "openSettings" });

    assert.equal(next.settingsOpen, true);
    assert.equal(next.menu, null);
    assert.equal(next.reply, null);
  });

  it("Esc en içteki katmanı kapatır", () => {
    let state = mentionsUiReducer({ ...open, settingsOpen: true }, { type: "closeTransient" });
    assert.equal(state.settingsOpen, false);
    assert.equal(state.menu, "a", "Modal kapanırken menü hayatta kalır.");

    state = mentionsUiReducer(state, { type: "closeTransient" });
    assert.equal(state.menu, null);

    state = mentionsUiReducer(state, { type: "closeTransient" });
    assert.equal(state.reply, null);

    state = mentionsUiReducer(state, { type: "closeTransient" });
    assert.equal(state.panel, null);

    assert.deepEqual(mentionsUiReducer(state, { type: "closeTransient" }), state);
  });

  it("başlangıç durumunda hiçbir katman açık değil", () => {
    assert.deepEqual(MENTIONS_UI_INITIAL_STATE, {
      menu: null,
      reply: null,
      panel: null,
      settingsOpen: false,
      cursor: null,
    });
  });
});
