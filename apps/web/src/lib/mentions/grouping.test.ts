import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Mention } from "@wizards/types";

import {
  MENTIONS_VIRTUALIZE_THRESHOLD,
  READ_LATER_GROUP_ID,
  flattenMentionGroups,
  groupMentions,
  listMentionIds,
  matchesMentionRoute,
  resolveMentionTimeBucket,
} from "./grouping";
import { MENTIONS_DEFAULT_ROUTE_STATE } from "./routes";

/**
 * Ş5 — akışın gruplama sözleşmesi (SPEC §5, karar K5/K7).
 *
 * Bu modül **saf**: React yok, sözlük yok, `Date.now()` yok. Eşik değerlerinin izleyicinin
 * saat diliminde hesaplandığını UTC'de doğrulamak mümkün olmadığı için testler bilerek
 * Istanbul ile Los Angeles arasında gidip geliyor.
 */

const ISTANBUL = "Europe/Istanbul";

function mention(overrides: Partial<Mention> & { id: string }): Mention {
  return {
    author: { avatarUrl: null, handle: "selin", id: "u1", initials: "SA", name: "Selin Aksoy" },
    body: "kart yoğunluğu kararını bugünkü kritiğe alalım mı?",
    createdAt: "2026-08-21T06:41:00.000Z",
    href: "/channels/s1/c1?message=m1",
    kind: "me",
    messageId: "m1",
    permalink: "https://whispr.app/channels/s1/c1?message=m1",
    readLater: false,
    source: {
      channelId: "c1",
      channelName: "tasarım-kritiği",
      serverId: "s1",
      serverInitial: "W",
      serverName: "Whispr Topluluğu",
      type: "channel",
    },
    stateKey: { refId: overrides.id, source: "channel" },
    tag: "@Doğukan Yazar",
    unread: true,
    ...overrides,
    id: `channel:${overrides.id}`,
  };
}

function dmMention(overrides: Partial<Mention> & { id: string }): Mention {
  return {
    ...mention(overrides),
    source: { conversationId: "dm-1", title: "Zeynep Arı", type: "dm" },
  };
}

/** 2026-08-21 09:41 Istanbul. */
const NOW = new Date("2026-08-21T06:41:00.000Z");

describe("resolveMentionTimeBucket", () => {
  it("bugün, dün, bu hafta ve daha eskiyi takvim gününden ayırır", () => {
    assert.equal(resolveMentionTimeBucket("2026-08-21T05:00:00.000Z", NOW, ISTANBUL), "today");
    assert.equal(resolveMentionTimeBucket("2026-08-20T18:30:00.000Z", NOW, ISTANBUL), "yesterday");
    assert.equal(resolveMentionTimeBucket("2026-08-17T08:20:00.000Z", NOW, ISTANBUL), "thisWeek");
    assert.equal(resolveMentionTimeBucket("2026-08-10T08:20:00.000Z", NOW, ISTANBUL), "older");
  });

  it("eşik izleyicinin saat diliminde hesaplanır, UTC'de değil", () => {
    // `now` Istanbul'da 21 Ağustos 09:41, Los Angeles'ta hâlâ 20 Ağustos 23:41.
    // Bu damga Istanbul'da 20 Ağustos 15:00 (dün), Los Angeles'ta 20 Ağustos 05:00 (bugün).
    const at = "2026-08-20T12:00:00.000Z";

    assert.equal(resolveMentionTimeBucket(at, NOW, ISTANBUL), "yesterday");
    assert.equal(resolveMentionTimeBucket(at, NOW, "America/Los_Angeles"), "today");
  });

  it("aynı takvim gününün başındaki bahsetme dün'e düşmez", () => {
    // Istanbul'da 00:05 — UTC'de bir önceki gün.
    assert.equal(resolveMentionTimeBucket("2026-08-20T21:05:00.000Z", NOW, ISTANBUL), "today");
  });

  it("ileri tarihli bir damga bugün sayılır", () => {
    // Sunucu saati ile istemci saati arasındaki kayma bir kartı geleceğe atabilir;
    // "daha eski" demek onu listenin dibine gömerdi.
    assert.equal(resolveMentionTimeBucket("2026-08-22T09:00:00.000Z", NOW, ISTANBUL), "today");
  });

  it("tanınmayan saat dilimi çökmez", () => {
    assert.equal(
      resolveMentionTimeBucket("2026-08-21T05:00:00.000Z", NOW, "Mars/Olympus"),
      "today",
    );
  });
});

describe("groupMentions — zamana göre", () => {
  const options = {
    dmLabel: "Direkt mesajlar",
    grouping: "time",
    now: NOW,
    timeZone: ISTANBUL,
  } as const;

  it("boş grubu render listesine koymaz", () => {
    const groups = groupMentions(
      [mention({ createdAt: "2026-08-21T05:00:00.000Z", id: "a" })],
      options,
    );

    assert.deepEqual(
      groups.map((group) => group.id),
      ["today"],
    );
  });

  it("grupları tasarımın sırasıyla verir", () => {
    const groups = groupMentions(
      [
        mention({ createdAt: "2026-08-10T05:00:00.000Z", id: "old" }),
        mention({ createdAt: "2026-08-21T05:00:00.000Z", id: "today" }),
        mention({ createdAt: "2026-08-17T05:00:00.000Z", id: "week" }),
        mention({ createdAt: "2026-08-20T18:00:00.000Z", id: "yesterday" }),
      ],
      options,
    );

    assert.deepEqual(
      groups.map((group) => group.id),
      ["today", "yesterday", "thisWeek", "older"],
    );
  });

  it("K5 — `Sonra oku` en üstte, kendi grubunda ve zaman grubunda değil", () => {
    const groups = groupMentions(
      [
        mention({ createdAt: "2026-08-21T05:00:00.000Z", id: "fresh" }),
        mention({ createdAt: "2026-08-10T05:00:00.000Z", id: "saved", readLater: true }),
      ],
      options,
    );

    assert.deepEqual(
      groups.map((group) => group.id),
      [READ_LATER_GROUP_ID, "today"],
    );
    assert.deepEqual(
      groups[0]?.items.map((item) => item.id),
      ["channel:saved"],
    );
    // Aynı kart ikinci bir grupta tekrar çizilmez.
    assert.deepEqual(
      groups[1]?.items.map((item) => item.id),
      ["channel:fresh"],
    );
  });

  it("grup içindeki sıra sunucudan geldiği gibi korunur", () => {
    const groups = groupMentions(
      [
        mention({ createdAt: "2026-08-21T06:41:00.000Z", id: "first" }),
        mention({ createdAt: "2026-08-21T06:18:00.000Z", id: "second" }),
        mention({ createdAt: "2026-08-21T05:52:00.000Z", id: "third" }),
      ],
      options,
    );

    assert.deepEqual(
      groups[0]?.items.map((item) => item.id),
      ["channel:first", "channel:second", "channel:third"],
    );
  });

  it("etiket sözlüğe bırakılır — modül metin üretmez", () => {
    const groups = groupMentions(
      [mention({ createdAt: "2026-08-21T05:00:00.000Z", id: "a" })],
      options,
    );

    assert.deepEqual(groups[0]?.label, { kind: "preset", preset: "today" });
  });
});

describe("groupMentions — kaynağa göre", () => {
  const options = {
    dmLabel: "Direkt mesajlar",
    grouping: "source",
    now: NOW,
    timeZone: ISTANBUL,
  } as const;

  it("kaynakları akıştaki en yeni bahsetmeye göre sıralar, DM'i en sona koyar", () => {
    const groups = groupMentions(
      [
        dmMention({ createdAt: "2026-08-21T07:00:00.000Z", id: "dm-newest" }),
        mention({ createdAt: "2026-08-21T06:00:00.000Z", id: "whispr" }),
        mention({
          createdAt: "2026-08-21T06:30:00.000Z",
          id: "product",
          source: {
            channelId: "c9",
            channelName: "sürüm-2-4",
            serverId: "s2",
            serverInitial: "P",
            serverName: "Product Team",
            type: "channel",
          },
        }),
      ],
      options,
    );

    assert.deepEqual(
      groups.map((group) => group.id),
      ["s2", "s1", "dm"],
    );
    // En yeni bahsetme DM'de olsa bile DM en sonda kalır.
    assert.deepEqual(groups.at(-1)?.label, { kind: "source", text: "Direkt mesajlar" });
  });

  it("sunucu grubunun etiketi sunucu adı", () => {
    const groups = groupMentions([mention({ id: "a" })], options);

    assert.deepEqual(groups[0]?.label, { kind: "source", text: "Whispr Topluluğu" });
  });

  it("`Sonra oku` kaynağa göre gruplamada da en üstte kalır", () => {
    const groups = groupMentions(
      [mention({ id: "a" }), mention({ id: "saved", readLater: true })],
      options,
    );

    assert.equal(groups[0]?.id, READ_LATER_GROUP_ID);
  });
});

describe("flattenMentionGroups", () => {
  const groups = groupMentions(
    [
      mention({ createdAt: "2026-08-21T06:41:00.000Z", id: "a" }),
      mention({ createdAt: "2026-08-21T06:18:00.000Z", id: "b" }),
      mention({ createdAt: "2026-08-20T18:00:00.000Z", id: "c" }),
    ],
    { dmLabel: "Direkt mesajlar", grouping: "time", now: NOW, timeZone: ISTANBUL },
  );

  it("başlıkları ve kartları tek düz listeye çevirir", () => {
    const rows = flattenMentionGroups(groups);

    assert.deepEqual(
      rows.map((row) => row.type),
      ["group", "mention", "mention", "group", "mention"],
    );
  });

  it("grubun son kartını işaretler — alt boşluğu ondan geliyor", () => {
    const rows = flattenMentionGroups(groups);
    const lastFlags = rows.flatMap((row) => (row.type === "mention" ? [row.lastInGroup] : []));

    assert.deepEqual(lastFlags, [false, true, true]);
  });

  it("satır anahtarları benzersiz — sanal listede anahtar çakışması ölçüm bozar", () => {
    const rows = flattenMentionGroups(groups);
    const keys = rows.map((row) => row.key);

    assert.equal(new Set(keys).size, keys.length);
  });
});

describe("listMentionIds", () => {
  it("klavye imlecinin sırası ekrandaki sıradır", () => {
    const groups = groupMentions(
      [
        mention({ createdAt: "2026-08-20T18:00:00.000Z", id: "yesterday" }),
        mention({ createdAt: "2026-08-21T06:41:00.000Z", id: "today" }),
        mention({ createdAt: "2026-08-10T06:41:00.000Z", id: "saved", readLater: true }),
      ],
      { dmLabel: "Direkt mesajlar", grouping: "time", now: NOW, timeZone: ISTANBUL },
    );

    assert.deepEqual(listMentionIds(groups), [
      "channel:saved",
      "channel:today",
      "channel:yesterday",
    ]);
  });
});

describe("matchesMentionRoute", () => {
  const route = MENTIONS_DEFAULT_ROUTE_STATE;

  it("varsayılan görünüm her bahsetmeyi alır", () => {
    assert.equal(matchesMentionRoute(mention({ id: "a" }), route), true);
  });

  it("filtre türü daraltır", () => {
    assert.equal(
      matchesMentionRoute(mention({ id: "a", kind: "me" }), { ...route, filter: "me" }),
      true,
    );
    assert.equal(
      matchesMentionRoute(mention({ id: "a", kind: "thread" }), { ...route, filter: "me" }),
      false,
    );
  });

  it("`Rol · @herkes` iki türü birden alır", () => {
    assert.equal(
      matchesMentionRoute(mention({ id: "a", kind: "role" }), { ...route, filter: "role" }),
      true,
    );
    assert.equal(
      matchesMentionRoute(mention({ id: "a", kind: "everyone" }), { ...route, filter: "role" }),
      true,
    );
  });

  it("`Okunmamış` filtresi okunmuş kartı almaz", () => {
    assert.equal(
      matchesMentionRoute(mention({ id: "a", unread: false }), { ...route, filter: "unread" }),
      false,
    );
  });

  it("DM filtresi kanal bahsetmesini almaz", () => {
    assert.equal(matchesMentionRoute(mention({ id: "a" }), { ...route, filter: "dm" }), false);
    assert.equal(matchesMentionRoute(dmMention({ id: "a" }), { ...route, filter: "dm" }), true);
  });

  it("kaynak seçimi sunucu kimliğiyle eşleşir", () => {
    assert.equal(matchesMentionRoute(mention({ id: "a" }), { ...route, source: "s1" }), true);
    assert.equal(matchesMentionRoute(mention({ id: "a" }), { ...route, source: "s2" }), false);
    assert.equal(matchesMentionRoute(dmMention({ id: "a" }), { ...route, source: "dm" }), true);
  });

  it("arama açıkken hiçbir kart yerel olarak eklenmez", () => {
    // Eşleşme sunucudaki `ILIKE` ile kuruluyor; istemcide tahmin etmek, aramayla ilgisi
    // olmayan bir kartı sonuç listesine sokmak demek.
    assert.equal(matchesMentionRoute(mention({ id: "a" }), { ...route, query: "tasarım" }), false);
  });
});

describe("sanallaştırma eşiği", () => {
  it("60 kart", () => {
    // PROMPT §4: liste 60 karttan uzunsa pencereleme devreye girer.
    assert.equal(MENTIONS_VIRTUALIZE_THRESHOLD, 60);
  });
});
