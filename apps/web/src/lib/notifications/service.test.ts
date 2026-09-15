import { NotificationPageSchema } from "@/lib/notifications/types";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
  clearNotifications,
  getNotificationCounts,
  getUnreadCount,
  getMobileVisibleNotificationTypes,
  listNotificationPanel,
  listNotifications,
  markAllRead,
  markAllReadWithCounts,
  markRead,
  setRead,
  withNotificationCounts,
} from "@/lib/notifications/service";
import type { NotificationSocketPayload } from "@/lib/socket/events";

type Restore = () => void;
type UnknownRecord = Record<string, unknown>;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as UnknownRecord;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

/**
 * The three feed actions all touch the same four tables. Every test stubs the
 * lot so an unexpected call fails loudly instead of reaching a database the
 * test runner does not have.
 */
function stubNotificationTables(
  restores: Restore[],
  overrides: {
    findFirst?: (args: unknown) => Promise<unknown>;
    findMany?: (args: unknown) => Promise<unknown>;
    updateMany?: (args: unknown) => Promise<{ count: number }>;
  } = {},
) {
  const calls = {
    dmParticipantUpdateMany: [] as unknown[],
    notificationDeleteMany: [] as unknown[],
    notificationUpdateMany: [] as unknown[],
  };

  patchMethod(
    prisma.notification,
    "findFirst",
    overrides.findFirst ?? (async () => null),
    restores,
  );
  patchMethod(
    prisma.notification,
    "updateMany",
    async (args: unknown) => {
      calls.notificationUpdateMany.push(args);
      return overrides.updateMany?.(args) ?? { count: 1 };
    },
    restores,
  );
  patchMethod(prisma.notification, "findMany", overrides.findMany ?? (async () => []), restores);
  patchMethod(
    prisma.notification,
    "deleteMany",
    async (args: unknown) => {
      calls.notificationDeleteMany.push(args);
      return { count: 1 };
    },
    restores,
  );
  patchMethod(prisma.channelReadState, "findMany", async () => [], restores);
  patchMethod(prisma.channelReadState, "updateMany", async () => ({ count: 0 }), restores);
  patchMethod(
    prisma.dMParticipant,
    "updateMany",
    async (args: unknown) => {
      calls.dmParticipantUpdateMany.push(args);
      return { count: 1 };
    },
    restores,
  );

  // Ş2: okuma yolu artık dörtlü sayacı da okuyor. Ham sorgu stub'lanmazsa test veritabanı
  // arar; sıfır satır döndürmek sayacı sıfırlar ve sayaç iddiası olan testler kendi
  // değerlerini ayrıca kurar.
  patchMethod(prisma, "$queryRaw", async () => [], restores);

  return calls;
}

const ZERO_COUNTS = { all: 0, mentions: 0, replies: 0, system: 0 };

/** `getNotificationCounts` tek satır döndüren ham sorgudan okuyor; testler o satırı kurar. */
function stubCounts(restores: Restore[], counts: Partial<typeof ZERO_COUNTS> = {}) {
  const queries: unknown[] = [];
  patchMethod(
    prisma,
    "$queryRaw",
    async (query: unknown) => {
      queries.push(query);
      return [{ ...ZERO_COUNTS, ...counts }];
    },
    restores,
  );

  return queries;
}

function restoreAll(restores: Restore[]) {
  for (const restore of restores.reverse()) {
    restore();
  }
}

describe("mobile notification compatibility", () => {
  it("keeps BADGE rows away from frozen clients that cannot parse them", () => {
    assert.equal(
      getMobileVisibleNotificationTypes({ badgeCapable: false }).includes("BADGE"),
      false,
    );
    assert.equal(getMobileVisibleNotificationTypes({ badgeCapable: true }).includes("BADGE"), true);
  });

  it("keeps FEEDBACK rows visible to web and mobile clients", async () => {
    const restores: Restore[] = [];
    const queries: unknown[] = [];

    patchMethod(
      prisma.notification,
      "findMany",
      async (args: unknown) => {
        queries.push(args);
        return [
          {
            actionUrl: "/settings/feedback",
            body: "Feedback updated",
            createdAt: new Date("2026-08-12T12:00:00.000Z"),
            id: "feedback-1",
            metadata: null,
            readAt: null,
            type: "FEEDBACK",
          },
        ];
      },
      restores,
    );
    patchMethod(prisma.user, "findMany", async () => [], restores);
    patchMethod(
      prisma.notification,
      "count",
      async (args: unknown) => {
        queries.push(args);
        return 1;
      },
      restores,
    );

    try {
      const rows = await listNotifications("user-1", 5);
      const unreadCount = await getUnreadCount("user-1");

      assert.equal(rows[0]?.type, "FEEDBACK");
      assert.equal(unreadCount, 1);
      assert.equal(
        getMobileVisibleNotificationTypes({ badgeCapable: false }).includes("FEEDBACK"),
        true,
      );
      for (const query of queries) {
        const visibleTypes = (query as { where: { type: { in: string[] } } }).where.type.in;
        assert.equal(visibleTypes.includes("FEEDBACK"), true);
      }
    } finally {
      restoreAll(restores);
    }
  });
});

describe("direct message badge release", () => {
  it("retires one conversation's unread counter when a DM row is read", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({
        metadata: { conversationId: "conversation-1", mentioned: true, senderId: "sender-1" },
        read: false,
        type: "DM",
      }),
    });

    try {
      await markRead("user-1", "notification-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, [
      {
        where: {
          conversationId: "conversation-1",
          mentionCount: { gt: 0 },
          unreadCount: { gt: 0 },
          userId: "user-1",
        },
        data: {
          mentionCount: { decrement: 1 },
          unreadCount: { decrement: 1 },
        },
      },
    ]);
  });

  it("pays the counter once when concurrent reads race", async () => {
    const restores: Restore[] = [];
    let updateAttempt = 0;
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({
        metadata: { conversationId: "conversation-1" },
        type: "DM",
      }),
      updateMany: async () => ({ count: updateAttempt++ === 0 ? 1 : 0 }),
    });

    try {
      await markRead("user-1", "notification-1");
      await markRead("user-1", "notification-1");
    } finally {
      restoreAll(restores);
    }

    assert.equal(calls.dmParticipantUpdateMany.length, 1);
    assert.deepEqual(
      calls.notificationUpdateMany.map((args) => (args as { where: unknown }).where),
      [
        { id: "notification-1", read: false, userId: "user-1" },
        { id: "notification-1", read: false, userId: "user-1" },
      ],
    );
  });

  it("leaves the counter alone for a DM row with no conversation in its metadata", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({ metadata: null, read: false, type: "DM" }),
    });

    try {
      await markRead("user-1", "notification-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, []);
  });

  it("zeroes only conversation counters named by unread rows on mark-all-read", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findMany: async () => [
        { metadata: { conversationId: "conversation-1" } },
        { metadata: { conversationId: "conversation-1" } },
      ],
    });

    try {
      await markAllRead("user-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, [
      {
        where: { conversationId: { in: ["conversation-1"] }, userId: "user-1" },
        data: { mentionCount: 0, unreadCount: 0 },
      },
    ]);
  });

  it("leaves muted conversations without notification rows alone on clear-all", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findMany: async () => [{ metadata: { conversationId: "not-muted" } }],
    });

    try {
      await clearNotifications("user-1");
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, [
      {
        where: { conversationId: { in: ["not-muted"] }, userId: "user-1" },
        data: { mentionCount: 0, unreadCount: 0 },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Bildirim merkezi — Dalga 1 / Ş2
// ---------------------------------------------------------------------------

type PanelRow = {
  actionUrl: string | null;
  body: string;
  createdAt: Date;
  id: string;
  metadata: unknown;
  read: boolean;
  title: string;
  type: string;
};

/**
 * Sayfa ve sayaç aynı `$queryRaw` üzerinden geçiyor; stub ikisini SQL'e bakarak ayırır. Tek
 * bir dizi döndürmek, sayfayı sayaç satırıyla beslemek olurdu.
 */
function stubPanel(
  restores: Restore[],
  options: {
    channels?: { id: string; name: string }[];
    counts?: Partial<typeof ZERO_COUNTS>;
    rows: PanelRow[];
    timeZone?: string | null;
  },
) {
  const pageQueries: { sql: string; values: unknown[] }[] = [];

  patchMethod(
    prisma,
    "$queryRaw",
    async (query: unknown) => {
      const { sql, values } = query as { sql: string; values: unknown[] };
      if (sql.includes("COUNT(*)")) {
        return [{ ...ZERO_COUNTS, ...options.counts }];
      }
      pageQueries.push({ sql, values });
      return options.rows;
    },
    restores,
  );
  patchMethod(
    prisma.userNotificationSettings,
    "findUnique",
    async () => ({ quietHoursTimeZone: options.timeZone ?? null }),
    restores,
  );
  patchMethod(prisma.userSettings, "findUnique", async () => ({ timeZone: null }), restores);
  patchMethod(prisma.channel, "findMany", async () => options.channels ?? [], restores);

  return pageQueries;
}

function panelRow(overrides: Partial<PanelRow> & Pick<PanelRow, "id">): PanelRow {
  return {
    actionUrl: null,
    body: "gövde",
    createdAt: new Date("2026-08-24T06:41:00.000Z"),
    metadata: null,
    read: false,
    title: "başlık",
    type: "SYSTEM",
    ...overrides,
  };
}

describe("bildirim paneli — sayfa", () => {
  it("hedefi SQL'den API şemasına kadar korur ve mesaj bağlantısını tamamlar", async () => {
    const restores: Restore[] = [];
    const queries = stubPanel(restores, {
      rows: [
        panelRow({
          id: "n1",
          type: "MENTION",
          actionUrl: "/channels/server/channel",
          metadata: { messageId: "message-1" },
        }),
      ],
    });
    try {
      const page = await listNotificationPanel("user-1", { limit: 6, tab: "all" });
      assert.match(queries[0]!.sql, /"actionUrl"/u);
      const parsed = NotificationPageSchema.parse(page);
      assert.equal(
        parsed.groups[0]!.items[0]!.actionUrl,
        "/channels/server/channel?message=message-1",
      );
    } finally {
      restoreAll(restores);
    }
  });

  it("satırları gün gruplarına böler ve sekmeyi yanıtta taşır", async () => {
    const restores: Restore[] = [];
    stubPanel(restores, {
      counts: { all: 3, mentions: 2, replies: 1, system: 0 },
      rows: [
        panelRow({ createdAt: new Date("2026-08-24T06:41:00.000Z"), id: "n1", type: "MENTION" }),
        panelRow({ createdAt: new Date("2026-08-23T13:05:00.000Z"), id: "n6" }),
      ],
      timeZone: "Europe/Istanbul",
    });

    try {
      const page = await listNotificationPanel(
        "user-1",
        { limit: 6, tab: "all" },
        { now: new Date("2026-08-24T12:00:00.000Z") },
      );

      assert.equal(page.tab, "all");
      assert.deepEqual(
        page.groups.map((group) => [group.label, group.items.map((item) => item.id)]),
        [
          ["today", ["n1"]],
          ["yesterday", ["n6"]],
        ],
      );
      assert.deepEqual(page.counts, { all: 3, mentions: 2, replies: 1, system: 0 });
      assert.equal(page.nextCursor, null);
    } finally {
      restoreAll(restores);
    }
  });

  it("sunucu Türkçe metin göndermez — grup etiketi enum", async () => {
    const restores: Restore[] = [];
    stubPanel(restores, { rows: [panelRow({ id: "n1" })], timeZone: "Europe/Istanbul" });

    try {
      const page = await listNotificationPanel(
        "user-1",
        { limit: 6, tab: "all" },
        { now: new Date("2026-08-24T12:00:00.000Z") },
      );

      for (const group of page.groups) {
        assert.ok(["today", "yesterday", "older"].includes(group.label));
      }
      assert.doesNotMatch(JSON.stringify(page.groups.map((group) => group.label)), /Bugün|Dün/u);
    } finally {
      restoreAll(restores);
    }
  });

  it("limit+1 satır gelince imleç üretir ve fazlalığı yanıta koymaz", async () => {
    const restores: Restore[] = [];
    const rows = Array.from({ length: 7 }, (_, index) =>
      panelRow({
        createdAt: new Date(Date.UTC(2026, 7, 24, 12, 0, 7 - index)),
        id: `n${index + 1}`,
      }),
    );
    const pageQueries = stubPanel(restores, { rows, timeZone: "Europe/Istanbul" });

    try {
      const page = await listNotificationPanel(
        "user-1",
        { limit: 6, tab: "system" },
        { now: new Date("2026-08-24T12:00:10.000Z") },
      );
      const items = page.groups.flatMap((group) => group.items);

      assert.equal(items.length, 6);
      assert.equal(items.at(-1)?.id, "n6");
      assert.ok(page.nextCursor);
      // İmleç son **döndürülen** satırı işaret eder, çekilen fazlalığı değil; yoksa n6 ikinci
      // sayfada bir daha görünürdü.
      assert.equal(
        Buffer.from(page.nextCursor ?? "", "base64url")
          .toString("utf8")
          .endsWith("|n6"),
        true,
      );
      assert.equal(pageQueries[0]?.values.at(-1), 7);
    } finally {
      restoreAll(restores);
    }
  });

  it("imleç sorguya keyset koşulu olarak girer", async () => {
    const restores: Restore[] = [];
    const cursor = Buffer.from("2026-08-24T06:41:00.000Z|n1", "utf8").toString("base64url");
    const pageQueries = stubPanel(restores, { rows: [], timeZone: "Europe/Istanbul" });

    try {
      await listNotificationPanel("user-1", { cursor, limit: 6, tab: "all" });

      assert.match(pageQueries[0]?.sql ?? "", /"createdAt" </u);
      assert.equal(pageQueries[0]?.values.includes("n1"), true);
    } finally {
      restoreAll(restores);
    }
  });

  it("kanal adı `source.channel` olarak taşınır, kanal kimliği değil", async () => {
    const restores: Restore[] = [];
    stubPanel(restores, {
      channels: [{ id: "channel-1", name: "tasarım-kritiği" }],
      rows: [
        panelRow({
          id: "n1",
          metadata: { channelId: "channel-1", senderId: "user-9", serverId: "server-1" },
          type: "MENTION",
        }),
      ],
      timeZone: "Europe/Istanbul",
    });

    try {
      const page = await listNotificationPanel("user-1", { limit: 6, tab: "mentions" });
      const item = page.groups[0]?.items[0];

      assert.equal(item?.kind, "mention");
      assert.deepEqual(item?.source, {
        actorId: "user-9",
        channel: "tasarım-kritiği",
        serverId: "server-1",
      });
    } finally {
      restoreAll(restores);
    }
  });

  it("kaynağı olmayan satır `source` alanı taşımaz", async () => {
    const restores: Restore[] = [];
    stubPanel(restores, { rows: [panelRow({ id: "n1" })], timeZone: "Europe/Istanbul" });

    try {
      const page = await listNotificationPanel("user-1", { limit: 6, tab: "system" });

      assert.equal(page.groups[0]?.items[0]?.source, undefined);
    } finally {
      restoreAll(restores);
    }
  });
});

describe("bildirim paneli — sayaçlar", () => {
  it("yalnız okunmamışları sayar ve tek geçişten okur", async () => {
    const restores: Restore[] = [];
    const queries = stubCounts(restores, { all: 3, mentions: 2, replies: 1, system: 0 });

    try {
      const counts = await getNotificationCounts("user-1");

      assert.deepEqual(counts, { all: 3, mentions: 2, replies: 1, system: 0 });
      assert.equal(queries.length, 1);
      assert.match((queries[0] as { sql: string }).sql, /"read" = false/u);
    } finally {
      restoreAll(restores);
    }
  });

  it("satır dönmeyen sürücüde sıfırlara düşer", async () => {
    const restores: Restore[] = [];
    patchMethod(prisma, "$queryRaw", async () => [], restores);

    try {
      assert.deepEqual(await getNotificationCounts("user-1"), ZERO_COUNTS);
    } finally {
      restoreAll(restores);
    }
  });

  it("referans nCounts hesabını yeniden üretir", async () => {
    // `Ayarlar-referans.dc.html`: altı kayıt, ilk üçü okunmamış (iki bahsetme, bir yanıt).
    // Okunmuş üç kayıt (etkinlik, sistem, yanıt) hiçbir sayaca girmez.
    const restores: Restore[] = [];
    stubCounts(restores, { all: 3, mentions: 2, replies: 1, system: 0 });

    try {
      const counts = await getNotificationCounts("user-1");

      assert.equal(counts.all, counts.mentions + counts.replies + counts.system);
      assert.equal(counts.system, 0);
    } finally {
      restoreAll(restores);
    }
  });

  it("`notification:new` yükü sayaçla beslenebilir", async () => {
    const restores: Restore[] = [];
    stubCounts(restores, { all: 4, mentions: 1, replies: 0, system: 3 });
    const payload = { id: "n1", userId: "user-1" } as unknown as NotificationSocketPayload;

    try {
      const enriched = await withNotificationCounts(payload);

      assert.deepEqual(enriched.counts, { all: 4, mentions: 1, replies: 0, system: 3 });
      assert.equal(enriched.id, "n1");
    } finally {
      restoreAll(restores);
    }
  });
});

describe("bildirim paneli — çevirme", () => {
  it("okunmuşu okunmamışa çevirir ve `readAt` alanını boşaltır", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({ metadata: null, type: "SYSTEM" }),
    });
    stubCounts(restores, { all: 1, system: 1 });

    try {
      const counts = await setRead("user-1", "notification-1", false, { emitRead: () => {} });

      assert.deepEqual(counts, { ...ZERO_COUNTS, all: 1, system: 1 });
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.notificationUpdateMany, [
      {
        where: { id: "notification-1", read: true, userId: "user-1" },
        data: { read: false, readAt: null },
      },
    ]);
  });

  it("geri alma kanal ve DM rozetlerini geri getirmez", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({ metadata: { channelId: "channel-1" }, type: "MENTION" }),
    });
    stubCounts(restores, { all: 1, mentions: 1 });

    try {
      await setRead("user-1", "notification-1", false, { emitRead: () => {} });
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(calls.dmParticipantUpdateMany, []);
  });

  it("çevirme `notification:read` olayını sayaçla yayar", async () => {
    const restores: Restore[] = [];
    stubNotificationTables(restores, {
      findFirst: async () => ({ metadata: null, type: "SYSTEM" }),
    });
    stubCounts(restores, { all: 2, mentions: 1, system: 1 });
    const emitted: unknown[] = [];

    try {
      await setRead("user-1", "notification-1", true, {
        emitRead: (userId, payload) => emitted.push([userId, payload]),
      });
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(emitted, [
      [
        "user-1",
        {
          counts: { ...ZERO_COUNTS, all: 2, mentions: 1, system: 1 },
          id: "notification-1",
          read: true,
        },
      ],
    ]);
  });

  it("toplu okuma tek olay yayar ve `id: null` taşır", async () => {
    const restores: Restore[] = [];
    stubNotificationTables(restores);
    stubCounts(restores);
    const emitted: unknown[] = [];

    try {
      const counts = await markAllReadWithCounts("user-1", {
        emitRead: (userId, payload) => emitted.push([userId, payload]),
      });

      assert.deepEqual(counts, ZERO_COUNTS);
    } finally {
      restoreAll(restores);
    }

    assert.deepEqual(emitted, [["user-1", { counts: ZERO_COUNTS, id: null, read: true }]]);
  });

  it("eski `markRead` / `markAllRead` imzaları korunur (mobil uç)", async () => {
    const restores: Restore[] = [];
    const calls = stubNotificationTables(restores, {
      findFirst: async () => ({ metadata: null, type: "SYSTEM" }),
    });

    try {
      const readResult = await markRead("user-1", "notification-1");
      const allResult = await markAllRead("user-1");

      assert.equal(readResult, undefined);
      assert.equal(allResult, undefined);
    } finally {
      restoreAll(restores);
    }

    const first = calls.notificationUpdateMany[0] as {
      data: { read: boolean; readAt: Date };
      where: Record<string, unknown>;
    };
    assert.deepEqual(first.where, { id: "notification-1", read: false, userId: "user-1" });
    assert.equal(first.data.read, true);
    assert.ok(first.data.readAt instanceof Date);
  });
});
