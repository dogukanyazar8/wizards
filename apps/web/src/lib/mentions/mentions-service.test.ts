import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MentionCountsSchema, MentionSchema, type MentionStateSource } from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  createFakeDatabase,
  fakeChannelResolver,
  sqlText,
  type RecordedQuery,
} from "@/lib/home/home-test-doubles";
import { toRelativeAppHref } from "@/lib/home/href";
import type { MentionQueryRow } from "@/lib/mentions/mentions-query";
import {
  MENTION_EVERYONE_TAG,
  countMentions,
  firstMentionToken,
  getMentionContext,
  listMentions,
  markAllMentionsRead,
  toMentionBody,
  undoMarkAllMentionsRead,
  updateMentionState,
  type MentionUndoStore,
} from "@/lib/mentions/mentions-service";

/**
 * Ş3 servis katmanı. Sorgu boş veriyle koşuyor — Ş2 henüz hiçbir satır yazmadı ve sözleşme
 * Dalga 0'da donduğu için dördü de şimdiden test edilebiliyor.
 */

const NOW = new Date("2026-08-21T12:00:00.000Z");
const ORIGIN = new URL("https://whispr.test");

function row(overrides: Partial<MentionQueryRow> = {}): MentionQueryRow {
  return {
    authorAvatarUrl: null,
    authorDisplayName: "Selin Aksoy",
    authorId: "u2",
    authorUsername: "selin",
    channelId: "c1",
    channelName: "genel",
    content: "@dogukan  şuna  bir  bakar mısın",
    conversationTitle: null,
    dismissed: false,
    kind: "me",
    mentionId: "channel:mn-1",
    messageId: "m-1",
    notificationId: "nt-1",
    occurredAt: new Date("2026-08-21T09:41:00.000Z"),
    quoteAuthorName: null,
    quoteText: null,
    readLaterFirst: false,
    refId: "mn-1",
    roleName: null,
    serverId: "s1",
    serverName: "Whispr",
    sourceKey: "s1",
    stateSource: "channel" as MentionStateSource,
    threadParentId: null,
    unread: true,
    ...overrides,
  };
}

function database(queryRaw: readonly unknown[], models: Record<string, never> | object = {}) {
  return createFakeDatabase({
    models: {
      serverMember: { findMany: () => [{ roles: [], serverId: "s1" }] },
      user: {
        findUnique: () => ({ displayName: "Doğukan Yazar", locale: "tr", username: "dogukan" }),
      },
      ...(models as Record<string, Record<string, (args: unknown) => unknown>>),
    },
    queryRaw,
  });
}

function dependencies(db: ReturnType<typeof database>, extra: Record<string, unknown> = {}) {
  return {
    database: db.database,
    listVisibleChannels: fakeChannelResolver({ s1: ["c1", "c2"] }),
    now: () => NOW,
    origin: ORIGIN,
    ...extra,
  };
}

function rawCalls(calls: readonly RecordedQuery[]): RecordedQuery[] {
  return calls.filter((call) => call.operation === "$queryRaw");
}

function memoryUndoStore(seed: Record<string, string> = {}): MentionUndoStore & {
  entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(seed));

  return {
    entries,
    read: (key) => Promise.resolve(entries.get(key) ?? null),
    remove: (key) => Promise.resolve(entries.delete(key)),
    write: (key, value) => Promise.resolve(entries.set(key, value)),
  };
}

// ---------------------------------------------------------------------------

describe("listMentions — dört tür", () => {
  it("boş veriyle boş sayfa döner ve tek sorgu eder", async () => {
    const db = database([[]]);

    const payload = await listMentions(
      "u1",
      { filter: "all", limit: 20, window: "30d" },
      dependencies(db),
    );

    assert.deepEqual(payload, { items: [], nextCursor: null, sourceTitle: null, total: 0 });
    assert.equal(rawCalls(db.calls).length, 2);
  });

  it("Bana özel kartı izleyicinin kendi adıyla etiketler ve takıyı gövdeden çıkarır", async () => {
    const db = database([[row()]]);

    const payload = await listMentions(
      "u1",
      { filter: "all", limit: 20, window: "30d" },
      dependencies(db),
    );
    const mention = MentionSchema.parse(payload.items[0]);

    assert.equal(mention.kind, "me");
    assert.equal(mention.messageId, "m-1");
    assert.equal(mention.tag, "@Doğukan Yazar");
    assert.equal(mention.body, "şuna bir bakar mısın");
    assert.deepEqual(mention.stateKey, { refId: "mn-1", source: "channel" });
    assert.equal(mention.href, "/channels/s1/c1?message=m-1");
    assert.equal(toRelativeAppHref(mention.href), mention.href);
    assert.equal(mention.permalink, "https://whispr.test/channels/s1/c1?message=m-1");
    assert.equal(mention.unread, true);
  });

  it("Rol kartının takısı rolün adı; rol silinmişse kart hâlâ rol kartıdır", async () => {
    const db = database([
      [
        row({ kind: "role", mentionId: "channel:mn-2", refId: "mn-2", roleName: "tasarım" }),
        row({ kind: "role", mentionId: "channel:mn-3", refId: "mn-3", roleName: null }),
      ],
    ]);

    const payload = await listMentions(
      "u1",
      { filter: "role", limit: 20, window: "30d" },
      dependencies(db),
    );

    assert.equal(payload.items[0]?.tag, "@tasarım");
    assert.equal(payload.items[1]?.kind, "role");
  });

  it("everyone kartı sunucudan dil bağımsız takı taşır", async () => {
    const db = database([
      [row({ kind: "everyone", mentionId: "everyone:m-9", refId: "m-9", stateSource: "everyone" })],
    ]);

    const payload = await listMentions(
      "u1",
      { filter: "role", limit: 20, window: "30d" },
      dependencies(db),
    );

    assert.equal(payload.items[0]?.tag, MENTION_EVERYONE_TAG);
    assert.equal(payload.items[0]?.tag, "@everyone");
    assert.deepEqual(payload.items[0]?.stateKey, { refId: "m-9", source: "everyone" });
  });

  it("thread kartı yanıt sayısını ikinci bir sorgudan alır", async () => {
    const db = database([
      [
        row({
          kind: "thread",
          mentionId: "thread:m-7",
          refId: "m-7",
          stateSource: "thread",
          threadParentId: "p-1",
        }),
      ],
      [{ total: 1 }],
      [{ open: true, parentId: "p-1", replyCount: 12 }],
    ]);

    const payload = await listMentions(
      "u1",
      { filter: "thread", limit: 20, window: "30d" },
      dependencies(db),
    );

    assert.deepEqual(payload.items[0]?.thread, { id: "p-1", open: true, replyCount: 12 });
    // Sayfa, kesin toplam ve sayfadaki üst mesajlar için tek GROUP BY.
    assert.equal(rawCalls(db.calls).length, 3);
  });

  it("DM kartı konuşma başlığını taşır ve sunucu alanı yoktur", async () => {
    const db = database([
      [
        row({
          channelId: "conv-1",
          channelName: null,
          conversationTitle: "Zeynep Arı",
          mentionId: "dm:dmm-1",
          refId: "dmm-1",
          serverId: null,
          serverName: null,
          sourceKey: "dm",
          stateSource: "dm",
        }),
      ],
    ]);

    const payload = await listMentions(
      "u1",
      { filter: "dm", limit: 20, window: "30d" },
      dependencies(db),
    );

    assert.deepEqual(payload.items[0]?.source, {
      conversationId: "conv-1",
      title: "Zeynep Arı",
      type: "dm",
    });
    assert.equal(payload.items[0]?.href, "/messages/conv-1?message=m-1");
  });

  it("adsız grup DM başlığını üyelerden tek toplu sorguyla türetir", async () => {
    const db = database(
      [
        [
          row({
            channelId: "conv-group",
            channelName: null,
            conversationTitle: "Yanlış yazar adı",
            mentionId: "dm:dmm-group",
            refId: "dmm-group",
            serverId: null,
            serverName: null,
            sourceKey: "dm",
            stateSource: "dm",
          }),
        ],
      ],
      {
        dMConversation: {
          findMany: () => [
            {
              id: "conv-group",
              name: null,
              participants: [
                { userId: "u1", user: { displayName: "Doğukan", username: "dogukan" } },
                { userId: "u2", user: { displayName: "Ada", username: "ada" } },
                { userId: "u3", user: { displayName: "Mert", username: "mert" } },
              ],
            },
          ],
        },
        user: {
          findUnique: () => ({ displayName: "Doğukan Yazar", locale: "tr", username: "dogukan" }),
        },
      },
    );

    const payload = await listMentions(
      "u1",
      { filter: "dm", limit: 20, window: "30d" },
      dependencies(db),
    );

    assert.equal(payload.items[0]?.source.type, "dm");
    assert.equal(
      payload.items[0]?.source.type === "dm" ? payload.items[0].source.title : null,
      "Ada ve Mert",
    );
    assert.equal(db.calls.filter((call) => call.operation === "dMConversation.findMany").length, 1);
  });

  it("alıntı bloğu yalnız yanıtlanan mesaj varken çıkar", async () => {
    const db = database([[row({ quoteAuthorName: "Mert Kaya", quoteText: "  bunu  mu  " })]]);

    const payload = await listMentions(
      "u1",
      { filter: "all", limit: 20, window: "30d" },
      dependencies(db),
    );

    assert.deepEqual(payload.items[0]?.quote, { authorName: "Mert Kaya", text: "bunu mu" });
  });
});

describe("listMentions — sayfalama ve süzgeçler", () => {
  it("kesin toplamı ve boş sonuçta da seçili sunucu adını döndürür", async () => {
    const db = database([[], [{ total: 0 }]], {
      channel: { findFirst: () => ({ server: { name: "Whispr" } }) },
    });

    const payload = await listMentions(
      "u1",
      { filter: "unread", limit: 20, query: "yok", source: "s1", window: "30d" },
      dependencies(db),
    );

    assert.equal(payload.total, 0);
    assert.equal(payload.sourceTitle, "Whispr");
  });

  it("imleç Sonra oku bayrağını taşır — sabitlenmiş kart ikinci sayfada tekrarlanamaz", async () => {
    const db = database([
      [
        row({ mentionId: "channel:mn-1", readLaterFirst: true, refId: "mn-1" }),
        row({ mentionId: "channel:mn-2", refId: "mn-2" }),
      ],
    ]);

    const payload = await listMentions(
      "u1",
      { filter: "all", limit: 1, window: "30d" },
      dependencies(db),
    );

    assert.equal(payload.items.length, 1);
    assert.ok(payload.nextCursor);
    assert.equal(
      Buffer.from(payload.nextCursor ?? "", "base64url")
        .toString("utf8")
        .startsWith("1|"),
      true,
    );
  });

  it("arama sunucuya gider; istemci yüklenmiş sayfayı süzmez", async () => {
    const db = database([[]]);

    await listMentions(
      "u1",
      { filter: "all", limit: 20, query: "tasarım", window: "30d" },
      dependencies(db),
    );

    assert.ok(sqlText(rawCalls(db.calls)[0]?.args).includes("ILIKE"));
  });

  it("görünürlüğü kaybedilen kanal sorgunun kapsamında hiç yok", async () => {
    const db = database([[]]);

    await listMentions(
      "u1",
      { filter: "thread", limit: 20, window: "30d" },
      dependencies(db, { listVisibleChannels: fakeChannelResolver({ s1: [] }) }),
    );

    // Kanal dalı hiç kurulmadığı için sorgu da yapılmadı — sonucu elemek değil, hiç sormamak.
    assert.equal(rawCalls(db.calls).length, 0);
  });

  it("window=all pencere süzgecini kaldırır, satır taşımaz", async () => {
    const db = database([[]]);

    await listMentions("u1", { filter: "all", limit: 20, window: "all" }, dependencies(db));

    const sql = sqlText(rawCalls(db.calls)[0]?.args);
    assert.equal(/"createdAt" >(?!=)/.test(sql), false);
    assert.ok(!sql.includes("DELETE"));
  });
});

describe("countMentions — tek kaynak (K4)", () => {
  it("bütün kovaları tek sorgudan verir", async () => {
    const db = database(
      [
        [
          {
            all: 7,
            bySource: { dm: 2, s1: 5 },
            everyone: 1,
            me: 3,
            readLater: 1,
            role: 2,
            thread: 1,
            unread: 4,
          },
        ],
      ],
      {
        serverMember: {
          findMany: () => [
            {
              roles: [{ role: { name: "tasarım" } }, { role: { name: "ürün" } }],
              serverId: "s1",
            },
          ],
        },
      },
    );

    const counts = MentionCountsSchema.parse(
      await countMentions("u1", { window: "30d" }, dependencies(db)),
    );

    assert.equal(counts.unread, 4);
    assert.deepEqual(counts.bySource, { dm: 2, s1: 5 });
    assert.deepEqual(counts.roleNames, ["tasarım", "ürün"]);
    assert.equal(rawCalls(db.calls).length, 1);
  });

  it("satır dönmezse sıfırlanır, tanımsız kalmaz", async () => {
    const counts = await countMentions("u1", { window: "all" }, dependencies(database([[]])));

    assert.deepEqual(counts, {
      all: 0,
      bySource: {},
      everyone: 0,
      me: 0,
      readLater: 0,
      role: 0,
      roleNames: [],
      thread: 0,
      unread: 0,
    });
  });
});

describe("updateMentionState — iki taraf birden", () => {
  it("okundu yazımı bildirimi de okur", async () => {
    const db = database([[row()], [row({ unread: false })]]);

    const mention = await updateMentionState(
      "u1",
      { refId: "mn-1", source: "channel" },
      { read: true },
      dependencies(db),
    );

    const upsert = db.calls.find((call) => call.operation === "mentionState.upsert");
    assert.ok(upsert);
    assert.deepEqual((upsert.args as { update: unknown }).update, { readAt: NOW });

    const notification = db.calls.find((call) => call.operation === "notification.updateMany");
    assert.deepEqual((notification?.args as { data: unknown }).data, { read: true, readAt: NOW });
    assert.deepEqual((notification?.args as { where: unknown }).where, {
      dedupeKey: "channel-mention:m-1:u1",
      userId: "u1",
    });
    assert.equal(mention.unread, false);
  });

  it("Okunmadı işaretle iki tarafı da geri alır", async () => {
    const db = database([[row({ unread: false })], [row()]]);

    const mention = await updateMentionState(
      "u1",
      { refId: "mn-1", source: "channel" },
      { read: false },
      dependencies(db),
    );

    const upsert = db.calls.find((call) => call.operation === "mentionState.upsert");
    assert.deepEqual((upsert?.args as { update: unknown }).update, { readAt: null });

    const notification = db.calls.find((call) => call.operation === "notification.updateMany");
    assert.deepEqual((notification?.args as { data: unknown }).data, { read: false, readAt: null });
    assert.equal(mention.unread, true);
  });

  it("sayaç kolonlarına dokunmaz — K4 onları kanal ve DM rozetlerine bıraktı", async () => {
    const db = database([[row()], [row({ unread: false })]]);

    await updateMentionState(
      "u1",
      { refId: "mn-1", source: "channel" },
      { read: true },
      dependencies(db),
    );

    assert.ok(!db.calls.some((call) => call.operation.startsWith("channelReadState.")));
    assert.ok(!db.calls.some((call) => call.operation.startsWith("dMParticipant.")));
  });

  it("Sonra oku kartı okunmamış bırakır — okundu bayrağına dokunmaz (K5)", async () => {
    const db = database([[row()], [row({ readLaterFirst: true })]]);

    const mention = await updateMentionState(
      "u1",
      { refId: "mn-1", source: "channel" },
      { readLater: true },
      dependencies(db),
    );

    const upsert = db.calls.find((call) => call.operation === "mentionState.upsert");
    assert.deepEqual((upsert?.args as { update: unknown }).update, { readLaterAt: NOW });
    assert.ok(!db.calls.some((call) => call.operation === "notification.updateMany"));
    assert.equal(mention.readLater, true);
    assert.equal(mention.unread, true);
  });

  it("Listeden kaldır mesajı silmez ve kaldırılan kartın son hâlini döndürür", async () => {
    const db = database([[row()], [row({ dismissed: true })]]);

    const mention = await updateMentionState(
      "u1",
      { refId: "mn-1", source: "channel" },
      { dismissed: true },
      dependencies(db),
    );

    const upsert = db.calls.find((call) => call.operation === "mentionState.upsert");
    assert.deepEqual((upsert?.args as { update: unknown }).update, { dismissedAt: NOW });
    assert.ok(!db.calls.some((call) => call.operation.startsWith("message.delete")));
    assert.equal(mention.id, "channel:mn-1");
  });

  it("yirmi kez okundu/okunmadı çevirmek sayacı kaydırmıyor", async () => {
    const answers: unknown[] = [];
    for (let index = 0; index < 20; index += 1) {
      // Her tur iki okuma yapıyor: yazmadan önce ve yazdıktan sonra.
      answers.push([row({ unread: index % 2 === 0 })], [row({ unread: index % 2 !== 0 })]);
    }
    const db = database(answers);

    for (let index = 0; index < 20; index += 1) {
      await updateMentionState(
        "u1",
        { refId: "mn-1", source: "channel" },
        { read: index % 2 === 0 },
        dependencies(db),
      );
    }

    const upserts = db.calls.filter((call) => call.operation === "mentionState.upsert");
    const notifications = db.calls.filter((call) => call.operation === "notification.updateMany");
    assert.equal(upserts.length, 20);
    assert.equal(notifications.length, 20);
    // Sayaç bir kolondan değil sorgudan geliyor; kaydıracak bir toplam yok. Kanal ve DM
    // rozetlerinin kolonlarına ise hiç dokunulmadı (K4).
    assert.ok(!db.calls.some((call) => call.operation.startsWith("channelReadState.")));
    assert.ok(!db.calls.some((call) => call.operation.startsWith("dMParticipant.")));
    assert.deepEqual(
      notifications.map((call) => (call.args as { data: { read: boolean } }).data.read),
      Array.from({ length: 20 }, (_unused, index) => index % 2 === 0),
    );
  });

  it("erişilemeyen bir bahsetmenin durumu yazılmaz", async () => {
    const db = database([[]]);

    await assert.rejects(
      () =>
        updateMentionState(
          "u1",
          { refId: "mn-404", source: "channel" },
          { read: true },
          dependencies(db),
        ),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
    assert.ok(!db.calls.some((call) => call.operation === "mentionState.upsert"));
  });

  it("DM kartı DM dedupe anahtarını yazar", async () => {
    const dmRow = row({
      channelId: "conv-1",
      conversationTitle: "Zeynep Arı",
      mentionId: "dm:dmm-1",
      refId: "dmm-1",
      serverId: null,
      serverName: null,
      sourceKey: "dm",
      stateSource: "dm",
    });
    const db = database([[dmRow], [{ ...dmRow, unread: false }]]);

    await updateMentionState(
      "u1",
      { refId: "dmm-1", source: "dm" },
      { read: true },
      dependencies(db),
    );

    const notification = db.calls.find((call) => call.operation === "notification.updateMany");
    assert.equal(
      (notification?.args as { where: { dedupeKey: string } }).where.dedupeKey,
      "dm-message:m-1:u1",
    );
  });
});

describe("markAllMentionsRead — yalnız bahsetmeler (K11)", () => {
  it("bahsetme dışındaki bildirimlere dokunmaz", async () => {
    const db = database([
      [
        {
          mentionId: "channel:mn-1",
          notificationId: "nt-1",
          refId: "mn-1",
          stateSource: "channel",
        },
        { mentionId: "everyone:m-9", notificationId: null, refId: "m-9", stateSource: "everyone" },
      ],
    ]);
    const store = memoryUndoStore();

    const result = await markAllMentionsRead("u1", dependencies(db, { undoStore: store }));

    assert.equal(result.affected, 2);
    const notification = db.calls.find((call) => call.operation === "notification.updateMany");
    // Yazım sorgunun döndürdüğü kimliklerle sınırlı: arkadaşlık isteği bildirimi bu listede
    // olamaz, çünkü liste bahsetme sorgusundan geliyor.
    assert.deepEqual((notification?.args as { where: unknown }).where, {
      id: { in: ["nt-1"] },
      userId: "u1",
    });
    assert.equal(store.entries.size, 1);
  });

  it("okunmamış yoksa yazmaz ve jeton üretmez", async () => {
    const db = database([[]]);
    const store = memoryUndoStore();

    const result = await markAllMentionsRead("u1", dependencies(db, { undoStore: store }));

    assert.deepEqual(result, { affected: 0, undoToken: "" });
    assert.equal(store.entries.size, 0);
    assert.ok(!db.calls.some((call) => call.operation === "mentionState.upsert"));
  });

  it("geri alma iki tarafı da geri açar ve jetonu tüketir", async () => {
    const db = database([
      [
        {
          mentionId: "channel:mn-1",
          notificationId: "nt-1",
          refId: "mn-1",
          stateSource: "channel",
        },
      ],
    ]);
    const store = memoryUndoStore();
    const { undoToken } = await markAllMentionsRead("u1", dependencies(db, { undoStore: store }));

    const undone = await undoMarkAllMentionsRead(
      "u1",
      undoToken,
      dependencies(db, { undoStore: store }),
    );

    assert.equal(undone.restored, 1);
    const restored = db.calls.filter((call) => call.operation === "mentionState.updateMany");
    assert.deepEqual((restored[0]?.args as { data: unknown }).data, { readAt: null });
    const reopened = db.calls.filter((call) => call.operation === "notification.updateMany").at(-1);
    assert.deepEqual((reopened?.args as { data: unknown }).data, { read: false, readAt: null });
    assert.equal(store.entries.size, 0);
  });

  it("süresi dolmuş jeton reddedilir", async () => {
    await assert.rejects(
      () =>
        undoMarkAllMentionsRead(
          "u1",
          "gone",
          dependencies(database([]), { undoStore: memoryUndoStore() }),
        ),
      (error: unknown) => error instanceof ApiError && error.status === 410,
    );
  });

  it("başka bir kullanıcının jetonu okunamaz — anahtar kullanıcıya bağlı", async () => {
    const db = database([
      [{ mentionId: "channel:mn-1", notificationId: null, refId: "mn-1", stateSource: "channel" }],
    ]);
    const store = memoryUndoStore();
    const { undoToken } = await markAllMentionsRead("u1", dependencies(db, { undoStore: store }));

    await assert.rejects(
      () => undoMarkAllMentionsRead("u2", undoToken, dependencies(db, { undoStore: store })),
      (error: unknown) => error instanceof ApiError && error.status === 410,
    );
  });
});

describe("getMentionContext — ±2 mesaj", () => {
  it("bahsetmeyi ortada, öncekileri kronolojik sırada verir", async () => {
    const author = { avatarUrl: null, displayName: "Selin Aksoy", username: "selin" };
    const db = database([[row()]], {
      message: {
        findMany: (args: unknown) => {
          const where = (args as { where: { createdAt?: { gt?: Date; lt?: Date } } }).where;
          if (where.createdAt?.lt) {
            return [
              {
                author,
                content: "iki önce",
                createdAt: new Date("2026-08-21T09:39:00.000Z"),
                id: "b2",
              },
              {
                author,
                content: "bir önce",
                createdAt: new Date("2026-08-21T09:40:00.000Z"),
                id: "b1",
              },
            ];
          }
          if (where.createdAt?.gt) {
            return [
              {
                author,
                content: "sonra",
                createdAt: new Date("2026-08-21T09:42:00.000Z"),
                id: "a1",
              },
            ];
          }
          return [
            {
              author,
              content: "@dogukan bak",
              createdAt: new Date("2026-08-21T09:41:00.000Z"),
              id: "m-1",
            },
          ];
        },
      },
    });

    const context = await getMentionContext(
      "u1",
      { refId: "mn-1", source: "channel" },
      dependencies(db),
    );

    assert.deepEqual(
      context.messages.map((message) => message.id),
      ["b1", "b2", "m-1", "a1"],
    );
    assert.deepEqual(
      context.messages.map((message) => message.isMention),
      [false, false, true, false],
    );
    assert.equal(context.messages[0]?.initials, "SA");
  });

  it("DM bahsetmesi DM tablosundan okunur", async () => {
    const db = database(
      [
        [
          row({
            channelId: "conv-1",
            conversationTitle: "Zeynep Arı",
            mentionId: "dm:dmm-1",
            refId: "dmm-1",
            serverId: null,
            serverName: null,
            sourceKey: "dm",
            stateSource: "dm",
          }),
        ],
      ],
      { dMMessage: { findMany: () => [] } },
    );

    await getMentionContext("u1", { refId: "dmm-1", source: "dm" }, dependencies(db));

    assert.ok(db.calls.some((call) => call.operation === "dMMessage.findMany"));
    assert.ok(!db.calls.some((call) => call.operation === "message.findMany"));
  });
});

describe("metin yardımcıları", () => {
  it("gövde takıyı çıkarır ve boşlukları toplar", () => {
    assert.equal(toMentionBody("@dogukan   selam   (@ayse)  bak"), "selam () bak");
  });

  it("thread kartı için ilk takıyı bulur", () => {
    assert.equal(firstMentionToken("bence @mert haklı"), "@mert");
    assert.equal(firstMentionToken("takısız bir yanıt"), null);
  });
});
