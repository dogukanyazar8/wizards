import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@wizards/db";

import {
  compareNotificationExceptions,
  isMuteExpired,
  listNotificationExceptions,
  NOTIFICATION_EXCEPTION_LIMIT,
  resolveDmExceptionLevel,
  resolveExceptionLevel,
  type NotificationException,
} from "@/lib/notifications/exceptions-service";

/**
 * Ş4 §A. Üç kaynak tek liste, varsayılan satır dışarıda, süresi geçmiş sessize alma bir kez
 * temizleniyor.
 *
 * Sahte veritabanı burada duruyor, `home-test-doubles` içinde değil: o dosya Ana Sayfa
 * uçlarının sorgu bütçesini ölçüyor ve bu iki tabloyu tanımıyor. Ona iki ad eklemek, Ş4'ün
 * sahiplenmediği bir dosyayı üç şeridin paralel koştuğu bir dalgada değiştirmek olurdu.
 */

const NOW = new Date("2026-08-24T12:00:00.000Z");

type ServerRow = {
  messageNotifications: "ALL" | "MENTIONS" | "NOTHING" | "DEFAULT";
  muted: boolean;
  mutedUntil: Date | null;
  server: { iconUrl: string | null; name: string };
  serverId: string;
  suppressEveryone: boolean;
  suppressRoles: boolean;
};

type ChannelRow = {
  channel: { name: string };
  channelId: string;
  messageNotifications: "ALL" | "MENTIONS" | "NOTHING" | "DEFAULT";
  muted: boolean;
  mutedUntil: Date | null;
};

type DmRow = {
  conversation: {
    iconUrl: string | null;
    name: string | null;
    participants: Array<{
      user: { displayName: string | null; username: string };
      userId: string;
    }>;
  };
  conversationId: string;
  muted: boolean;
  notifyLevel: "ALL" | "MENTIONS" | "NONE";
};

type FakeRows = {
  channels?: ChannelRow[];
  dms?: DmRow[];
  servers?: ServerRow[];
};

type RecordedWrite = { model: string; args: unknown };

function serverRow(overrides: Partial<ServerRow> = {}): ServerRow {
  return {
    messageNotifications: "DEFAULT",
    muted: false,
    mutedUntil: null,
    server: { iconUrl: null, name: "Sunucu" },
    serverId: "s1",
    suppressEveryone: false,
    suppressRoles: false,
    ...overrides,
  };
}

function channelRow(overrides: Partial<ChannelRow> = {}): ChannelRow {
  return {
    channel: { name: "genel" },
    channelId: "c1",
    messageNotifications: "DEFAULT",
    muted: false,
    mutedUntil: null,
    ...overrides,
  };
}

function dmRow(overrides: Partial<DmRow> = {}): DmRow {
  return {
    conversation: {
      iconUrl: null,
      name: null,
      participants: [
        { user: { displayName: "Selin Aksoy", username: "selin" }, userId: "u2" },
        { user: { displayName: "Doğukan", username: "dogukan" }, userId: "viewer" },
      ],
    },
    conversationId: "d1",
    muted: false,
    notifyLevel: "MENTIONS",
    ...overrides,
  };
}

function createFakeDatabase(rows: FakeRows) {
  const reads: string[] = [];
  const writes: RecordedWrite[] = [];

  const findMany = (model: string, answer: unknown[]) => () => {
    reads.push(model);
    return Promise.resolve(answer);
  };

  const updateMany = (model: string) => (args: unknown) => {
    writes.push({ args, model });
    return Promise.resolve({ count: 1 });
  };

  const database = {
    dMParticipant: {
      findMany: findMany("dMParticipant", rows.dms ?? []),
    },
    userChannelSettings: {
      findMany: findMany("userChannelSettings", rows.channels ?? []),
      updateMany: updateMany("userChannelSettings"),
    },
    userServerSettings: {
      findMany: findMany("userServerSettings", rows.servers ?? []),
      updateMany: updateMany("userServerSettings"),
    },
  } as unknown as PrismaClient;

  return { database, reads, writes };
}

function list(rows: FakeRows, now = NOW) {
  const fake = createFakeDatabase(rows);

  return listNotificationExceptions("viewer", { database: fake.database, now }).then((result) => ({
    ...fake,
    result,
  }));
}

function keys(items: readonly NotificationException[]): string[] {
  return items.map((item) => item.id);
}

describe("düzey çözümü", () => {
  it("`DEFAULT` seviyeli ve susturulmamış satır istisna değildir", () => {
    assert.equal(
      resolveExceptionLevel(
        { messageNotifications: "DEFAULT", muted: false, mutedUntil: null },
        NOW,
      ),
      null,
    );
  });

  it("her `MessageNotification` üyesini kendi düzeyine çevirir", () => {
    const base = { muted: false, mutedUntil: null };

    assert.equal(resolveExceptionLevel({ ...base, messageNotifications: "ALL" }, NOW), "all");
    assert.equal(
      resolveExceptionLevel({ ...base, messageNotifications: "MENTIONS" }, NOW),
      "mentions",
    );
    assert.equal(resolveExceptionLevel({ ...base, messageNotifications: "NOTHING" }, NOW), "off");
  });

  it("susturma düzeyin önündedir", () => {
    // Kanal ucu `muted` seçimini `NOTHING + muted` olarak yazıyor; etiket `Sessiz` kalmalı.
    assert.equal(
      resolveExceptionLevel(
        { messageNotifications: "NOTHING", muted: true, mutedUntil: null },
        NOW,
      ),
      "muted",
    );
  });

  it("`suppress*` bayrakları varsayılan düzeyi `important` yapar", () => {
    const base = { messageNotifications: "DEFAULT" as const, muted: false, mutedUntil: null };

    assert.equal(resolveExceptionLevel({ ...base, suppressEveryone: true }, NOW), "important");
    assert.equal(resolveExceptionLevel({ ...base, suppressRoles: true }, NOW), "important");
    // Açık bir düzey varsa o daha belirgindir.
    assert.equal(
      resolveExceptionLevel(
        { ...base, messageNotifications: "MENTIONS", suppressRoles: true },
        NOW,
      ),
      "mentions",
    );
  });

  it("gelecekteki `mutedUntil` susturur, geçmiş olan susturmaz", () => {
    const future = new Date(NOW.getTime() + 3_600_000);
    const past = new Date(NOW.getTime() - 1);

    assert.equal(
      resolveExceptionLevel(
        { messageNotifications: "DEFAULT", muted: false, mutedUntil: future },
        NOW,
      ),
      "muted",
    );
    assert.equal(
      resolveExceptionLevel(
        { messageNotifications: "DEFAULT", muted: true, mutedUntil: past },
        NOW,
      ),
      null,
    );
  });

  it("`mutedUntil` tam şimdi ise süre dolmuş sayılır", () => {
    assert.equal(isMuteExpired({ muted: true, mutedUntil: new Date(NOW) }, NOW), true);
    assert.equal(isMuteExpired({ muted: true, mutedUntil: null }, NOW), false);
  });

  it("DM düzeyini otoriteden okur, aynadan değil", () => {
    assert.equal(resolveDmExceptionLevel("ALL", false), null);
    assert.equal(resolveDmExceptionLevel("ALL", true), null);
    assert.equal(resolveDmExceptionLevel("MENTIONS", false), "mentions");
    assert.equal(resolveDmExceptionLevel("NONE", true), "muted");
    assert.equal(resolveDmExceptionLevel("NONE", false), "off");
  });
});

describe("liste", () => {
  it("üç kaynağı doğru `scope` ile tek listede toplar", async () => {
    const { result } = await list({
      channels: [channelRow({ messageNotifications: "MENTIONS" })],
      dms: [dmRow()],
      servers: [serverRow({ messageNotifications: "NOTHING" })],
    });

    assert.deepEqual(keys(result.items), ["server:s1", "channel:c1", "dm:d1"]);
    assert.deepEqual(
      result.items.map((item) => item.scope),
      ["server", "channel", "dm"],
    );
    assert.deepEqual(
      result.items.map((item) => item.level),
      ["off", "mentions", "mentions"],
    );
    assert.equal(result.truncated, false);
  });

  it("kanal adını `#` önekiyle, DM adını karşı taraftan yazar", async () => {
    const { result } = await list({
      channels: [channelRow({ channel: { name: "duyurular" }, muted: true })],
      dms: [dmRow()],
    });

    assert.deepEqual(
      result.items.map((item) => item.name),
      ["#duyurular", "Selin Aksoy"],
    );
  });

  it("grup konuşmasının kendi adını kullanır", async () => {
    const { result } = await list({
      dms: [
        dmRow({
          conversation: {
            iconUrl: "https://cdn.test/icon.png",
            name: "Turnuva Arena",
            participants: [],
          },
          notifyLevel: "NONE",
        }),
      ],
    });

    assert.equal(result.items[0]?.name, "Turnuva Arena");
    assert.equal(result.items[0]?.iconUrl, "https://cdn.test/icon.png");
  });

  it("`DEFAULT` seviyeli ve susturulmamış satır listeye girmez", async () => {
    // Sorgunun `OR`u bu satırı getirmez ama `mobilePush` için yazılmış bir satır gelebilir.
    const { result } = await list({ servers: [serverRow()] });

    assert.deepEqual(result.items, []);
  });

  it("hem `muted` hem `suppressEveryone` olan sunucu listede bir kez çıkar", async () => {
    const { result } = await list({
      servers: [serverRow({ muted: true, suppressEveryone: true, suppressRoles: true })],
    });

    assert.deepEqual(keys(result.items), ["server:s1"]);
    assert.equal(result.items[0]?.level, "muted");
  });

  it("`mutedUntil` ISO olarak döner", async () => {
    const until = new Date(NOW.getTime() + 6 * 3_600_000);
    const { result } = await list({ servers: [serverRow({ muted: true, mutedUntil: until })] });

    assert.equal(result.items[0]?.mutedUntil, until.toISOString());
  });

  it("DM satırı süre pili taşımaz", async () => {
    const { result } = await list({ dms: [dmRow({ muted: true, notifyLevel: "NONE" })] });

    assert.equal(result.items[0]?.mutedUntil, null);
  });
});

describe("süresi geçmiş sessize alma", () => {
  const past = new Date(NOW.getTime() - 60_000);

  it("satır listeden düşer ve tembel düzeltilir", async () => {
    const { result, writes } = await list({
      servers: [serverRow({ muted: true, mutedUntil: past })],
    });

    assert.deepEqual(result.items, []);
    assert.deepEqual(writes, [
      {
        args: {
          data: { muted: false, mutedUntil: null },
          where: { serverId: { in: ["s1"] }, userId: "viewer" },
        },
        model: "userServerSettings",
      },
    ]);
  });

  it("başka bir sebeple istisna olan satır listede kalır, sessize alması yine temizlenir", async () => {
    const { result, writes } = await list({
      channels: [channelRow({ messageNotifications: "MENTIONS", muted: true, mutedUntil: past })],
    });

    assert.deepEqual(keys(result.items), ["channel:c1"]);
    assert.equal(result.items[0]?.level, "mentions");
    assert.equal(result.items[0]?.mutedUntil, null);
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.model, "userChannelSettings");
  });

  it("kapsam başına tek yazma yapar, satır başına değil", async () => {
    const { writes } = await list({
      channels: [
        channelRow({ channelId: "c1", muted: true, mutedUntil: past }),
        channelRow({ channelId: "c2", muted: true, mutedUntil: past }),
      ],
      servers: [
        serverRow({ serverId: "s1", muted: true, mutedUntil: past }),
        serverRow({ serverId: "s2", muted: true, mutedUntil: past }),
      ],
    });

    assert.equal(writes.length, 2);
    assert.deepEqual(writes.map((write) => write.model).sort(), [
      "userChannelSettings",
      "userServerSettings",
    ]);
  });

  it("temizlenecek satır yoksa hiç yazmaz", async () => {
    const { reads, writes } = await list({
      servers: [serverRow({ messageNotifications: "MENTIONS" })],
    });

    assert.deepEqual(writes, []);
    assert.deepEqual(reads.sort(), ["dMParticipant", "userChannelSettings", "userServerSettings"]);
  });
});

describe("sıralama ve kesme", () => {
  it("kapsam sırası addan önce gelir", () => {
    const rows: NotificationException[] = [
      {
        iconUrl: null,
        id: "dm:1",
        level: "muted",
        mutedUntil: null,
        name: "Ahmet",
        scope: "dm",
        scopeId: "1",
      },
      {
        iconUrl: null,
        id: "server:1",
        level: "muted",
        mutedUntil: null,
        name: "Zeynep Sunucusu",
        scope: "server",
        scopeId: "1",
      },
      {
        iconUrl: null,
        id: "channel:1",
        level: "muted",
        mutedUntil: null,
        name: "#genel",
        scope: "channel",
        scopeId: "1",
      },
    ];

    assert.deepEqual(keys([...rows].sort(compareNotificationExceptions)), [
      "server:1",
      "channel:1",
      "dm:1",
    ]);
  });

  it("`tr` collation ile sıralar — `Ç` `C` ile `D` arasındadır", async () => {
    const { result } = await list({
      servers: [
        serverRow({ serverId: "d", server: { iconUrl: null, name: "Deniz" }, muted: true }),
        serverRow({ serverId: "c-cedilla", server: { iconUrl: null, name: "Çınar" }, muted: true }),
        serverRow({ serverId: "c", server: { iconUrl: null, name: "Ceren" }, muted: true }),
      ],
    });

    assert.deepEqual(
      result.items.map((item) => item.name),
      ["Ceren", "Çınar", "Deniz"],
    );
  });

  it("200 üstünde keser ve `truncated` bayrağını kaldırır", async () => {
    const servers = Array.from({ length: NOTIFICATION_EXCEPTION_LIMIT + 1 }, (_, index) =>
      serverRow({
        muted: true,
        server: { iconUrl: null, name: `Sunucu ${String(index).padStart(4, "0")}` },
        serverId: `s${index}`,
      }),
    );
    const { result } = await list({ servers });

    assert.equal(result.items.length, NOTIFICATION_EXCEPTION_LIMIT);
    assert.equal(result.truncated, true);
  });

  it("tam 200 istisnada kesmez", async () => {
    const servers = Array.from({ length: NOTIFICATION_EXCEPTION_LIMIT }, (_, index) =>
      serverRow({
        muted: true,
        server: { iconUrl: null, name: `Sunucu ${String(index).padStart(4, "0")}` },
        serverId: `s${index}`,
      }),
    );
    const { result } = await list({ servers });

    assert.equal(result.items.length, NOTIFICATION_EXCEPTION_LIMIT);
    assert.equal(result.truncated, false);
  });
});
