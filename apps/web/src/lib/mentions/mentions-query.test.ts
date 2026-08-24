import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sqlText } from "@/lib/home/home-test-doubles";
import {
  MENTION_DEDUPE_PREFIX,
  MENTIONS_WINDOW_DAYS,
  buildMentionByKeyQuery,
  buildMentionCountsQuery,
  buildMentionPageQuery,
  buildMentionTotalQuery,
  buildMentionUnion,
  buildThreadReplyCountQuery,
  buildUnreadMentionKeysQuery,
  decodeMentionCursor,
  encodeMentionCursor,
  resolveMentionWindowStart,
  selectMentionBranches,
  toMentionSearchPattern,
  type MentionQueryScope,
} from "@/lib/mentions/mentions-query";

/**
 * Sorgu **metni** üzerinden test ediliyor, çünkü test edilen şey sonuç değil kapsam: bir dalın
 * hiç kurulmamış olması ile kurulup sonucunun elenmesi aynı sonucu verir, ama biri O(sayfa)
 * diğeri O(kullanıcının bütün bahsetmeleri).
 */

const NOW = new Date("2026-08-21T12:00:00.000Z");

function scope(overrides: Partial<MentionQueryScope> = {}): MentionQueryScope {
  return {
    channelIds: ["c1", "c2"],
    filter: "all",
    now: NOW,
    query: null,
    source: null,
    userId: "u1",
    window: "30d",
    ...overrides,
  };
}

function sql(value: { strings?: unknown } | null): string {
  return value ? sqlText(value) : "";
}

describe("mentions query — dal seçimi", () => {
  it("dört dalı da varsayılan filtrede kurar", () => {
    assert.deepEqual(selectMentionBranches("all", null), ["channel", "dm", "everyone", "thread"]);
  });

  it("Rol · @herkes sekmesi iki dal açar — tasarımda tek sekme, veride iki kaynak", () => {
    assert.deepEqual(selectMentionBranches("role", null), ["channel", "everyone"]);
  });

  it("DM sekmesi kanal tablolarına hiç bakmaz", () => {
    assert.deepEqual(selectMentionBranches("dm", null), ["dm"]);
  });

  it("Bana özel hem kanal hem DM okur; kişiye özel bahsetme her iki yerde de olur", () => {
    assert.deepEqual(selectMentionBranches("me", null), ["channel", "dm"]);
  });

  it("bir sunucu seçiliyken DM dalı hiç kurulmaz — DM'lerin sunucusu yok", () => {
    assert.deepEqual(selectMentionBranches("all", "s1"), ["channel", "everyone", "thread"]);
  });

  it("kaynak dm ise yalnız DM dalı kalır", () => {
    assert.deepEqual(selectMentionBranches("all", "dm"), ["dm"]);
  });

  it("görünür kanal yokken kanal dalları kurulmaz ama DM okunur", () => {
    const text = sql(buildMentionUnion(scope({ channelIds: [] })));

    assert.ok(text.includes('FROM "DMMessageMention" dmm'));
    assert.ok(!text.includes('FROM "MessageMention" mm'));
    assert.ok(!text.includes('FROM "ThreadFollow" tf'));
  });

  it("görünür kanal yokken ve filtre DM dışıysa hiç sorgu kurulmaz", () => {
    assert.equal(buildMentionUnion(scope({ channelIds: [], filter: "thread" })), null);
  });
});

describe("mentions query — görünürlük sorgunun kendi süzgeci", () => {
  it("dört dal da izleyicinin görebildiği kanallarla sınırlı", () => {
    const text = sql(buildMentionUnion(scope()));
    assert.equal(text.match(/m\."channelId" IN \(/g)?.length, 3);
  });

  it("DM dalı üyelik ve kırpılmış geçmiş sınırıyla okunur", () => {
    const text = sql(buildMentionUnion(scope({ filter: "dm" })));

    assert.ok(text.includes('INNER JOIN "DMParticipant" p'));
    assert.match(text, /p\."historyFromAt" IS NULL OR m\."createdAt" >= p\."historyFromAt"/);
    assert.match(text, /m\."expiresAt" IS NULL OR m\."expiresAt" >/);
  });

  it("silinmiş ve yer tutucusu kaldırılmış mesajlar her dalda elenir", () => {
    const text = sql(buildMentionUnion(scope()));

    assert.equal(text.match(/m\."deletedAt" IS NULL/g)?.length, 4);
    assert.equal(text.match(/m\."placeholderRemovedAt" IS NULL/g)?.length, 4);
  });

  it("@herkes ve thread dallarında yazar kendi mesajını bahsetme olarak görmez", () => {
    const text = sql(buildMentionUnion(scope()));
    assert.equal(text.match(/m\."userId" <>/g)?.length, 2);
  });

  it("kapatılmış thread takibi akışa hiçbir şey vermez", () => {
    const text = sql(buildMentionUnion(scope({ filter: "thread" })));
    assert.ok(text.includes('tf."mutedAt" IS NULL'));
  });
});

describe("mentions query — birleşik okundu kuralı", () => {
  it("okunmamış = MentionState.readAt IS NULL AND COALESCE(Notification.read, TRUE) = FALSE", () => {
    const text = sql(buildMentionUnion(scope()));

    assert.ok(text.includes('(ms."readAt" IS NULL AND COALESCE(n."read", TRUE) = FALSE)'));
  });

  it("bildirim satırı olmayan bahsetme okunmuş sayılır — tuzak #2 korunuyor", () => {
    // `COALESCE(..., TRUE)` bu kuralın kendisi: satır yoksa değer TRUE, yani okunmuş.
    const text = sql(buildMentionUnion(scope()));
    assert.ok(!text.includes('COALESCE(n."read", FALSE)'));
  });

  it("her dal kendi dedupeKey önekini eşler", () => {
    const text = sql(buildMentionUnion(scope()));

    for (const prefix of Object.values(MENTION_DEDUPE_PREFIX)) {
      assert.ok(text.includes(prefix), `dedupe prefix missing: ${prefix}`);
    }
  });

  it("okunmamış filtresi SQL'de, yüklenmiş sayfada değil", () => {
    const text = sql(buildMentionUnion(scope({ filter: "unread" })));
    assert.equal(
      text.match(/AND \(ms\."readAt" IS NULL AND COALESCE\(n\."read", TRUE\) = FALSE\)/g)?.length,
      4,
    );
  });

  it("sayaç kolonlarına hiç bakmaz — K4 bağı kesti", () => {
    const text = sql(buildMentionUnion(scope()));

    assert.ok(!text.includes("ChannelReadState"));
    assert.ok(!text.includes('"mentionCount"'));
  });
});

describe("mentions query — sıralama ve imleç", () => {
  it("Sonra oku her zaman üstte (K5)", () => {
    const text = sql(buildMentionPageQuery(scope(), null, 20));

    assert.ok(text.includes('ORDER BY "readLaterFirst" DESC, "occurredAt" DESC, "mentionId" DESC'));
  });

  it("imleç üç anahtarı da taşır ve gidiş-dönüşte aynı kalır", () => {
    const cursor = { id: "channel:mn-1", occurredAt: NOW, readLaterFirst: true };
    assert.deepEqual(decodeMentionCursor(encodeMentionCursor(cursor)), cursor);
  });

  it("bozuk imleç hata değil, imleçsiz sayfa demektir", () => {
    assert.equal(decodeMentionCursor("!!!not-a-cursor!!!"), null);
    assert.equal(decodeMentionCursor(undefined), null);
  });

  it("imleç bileşik kimliğin içindeki ayracı bozmaz", () => {
    const cursor = { id: "everyone:a:b:c", occurredAt: NOW, readLaterFirst: false };
    assert.deepEqual(decodeMentionCursor(encodeMentionCursor(cursor)), cursor);
  });

  it("imleç dört dala birden uygulanır, yoksa ikinci sayfa aynı kartları tekrarlar", () => {
    const text = sql(
      buildMentionPageQuery(
        scope(),
        { id: "channel:mn-1", occurredAt: NOW, readLaterFirst: false },
        20,
      ),
    );

    assert.equal(text.match(/AND \(\(ms\."readLaterAt" IS NOT NULL\),/g)?.length, 4);
  });

  it("bir fazlasını ister — sonraki sayfanın olup olmadığı ancak böyle bilinir", () => {
    assert.ok(sql(buildMentionPageQuery(scope(), null, 20)).includes("21"));
  });
});

describe("mentions query — exact list total", () => {
  it("counts the same filtered scope without a pagination cursor", () => {
    const text = sql(
      buildMentionTotalQuery(scope({ filter: "unread", query: "tasarım", source: "s1" })),
    );

    assert.ok(text.includes('COUNT(*)::int AS "total"'));
    assert.ok(text.includes('m."content" ILIKE'));
    assert.ok(text.includes('c."serverId" ='));
    assert.ok(!text.includes('"mentionId") <'));
  });
});

describe("mentions query — pencere (K7)", () => {
  it("30 gün varsayılan ve dört dala birden uygulanır", () => {
    assert.deepEqual(
      resolveMentionWindowStart("30d", NOW),
      new Date(NOW.getTime() - MENTIONS_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    );
    assert.equal(sql(buildMentionUnion(scope())).match(/"createdAt" >(?!=)/g)?.length, 4);
  });

  it("window=all sınırsız — hiçbir satır silinmez, yalnız süzgeç kalkar", () => {
    assert.equal(resolveMentionWindowStart("all", NOW), null);
    assert.equal(
      sql(buildMentionUnion(scope({ window: "all" }))).match(/"createdAt" >(?!=)/g),
      null,
    );
  });
});

describe("mentions query — arama sunucuda", () => {
  it("metin, yazar adı, kullanıcı adı, kanal ve sunucu adında arar", () => {
    const text = sql(buildMentionUnion(scope({ query: "tasarım" })));

    assert.ok(text.includes('m."content" ILIKE'));
    assert.ok(text.includes('u."username" ILIKE'));
    assert.ok(text.includes("COALESCE(u.\"displayName\", '') ILIKE"));
    assert.ok(text.includes('c."name" ILIKE'));
    assert.ok(text.includes('s."name" ILIKE'));
  });

  it("ILIKE joker karakterleri veri olarak kaçırılır", () => {
    // Kaçırılmasaydı `%` yazan biri bütün satırları eşleştirir ve arama sessizce
    // filtresiz kalırdı.
    assert.equal(toMentionSearchPattern("%50_indirim"), "%\\%50\\_indirim%");
    assert.equal(toMentionSearchPattern("a\\b"), "%a\\\\b%");
  });
});

describe("mentions query — kaldırılmış kartlar", () => {
  it("akış dismissed kartları göstermez", () => {
    assert.equal(
      sql(buildMentionUnion(scope())).match(/AND ms\."dismissedAt" IS NULL/g)?.length,
      4,
    );
  });

  it("tek bahsetme okuması gösterir — kartı kaldıran istek yanıtını 404 yapamaz", () => {
    const text = sql(buildMentionByKeyQuery(scope(), { refId: "mn-1", source: "channel" }));

    assert.ok(!text.includes('AND ms."dismissedAt" IS NULL'));
    assert.ok(text.includes("channel:mn-1"));
  });
});

describe("mentions query — sayaçlar", () => {
  it("bütün sayılar tek taramadan gelir", () => {
    const text = sql(buildMentionCountsQuery(scope()));

    for (const bucket of ["all", "unread", "me", "role", "everyone", "thread", "readLater"]) {
      assert.ok(text.includes(`AS "${bucket}"`), `missing bucket: ${bucket}`);
    }
    assert.ok(text.includes("json_object_agg"));
    assert.ok(text.includes("WITH mentions AS"));
  });

  it("sayaç ekranın filtresinden bağımsız — ray bütün türleri aynı anda gösterir", () => {
    const text = sql(buildMentionCountsQuery(scope({ filter: "dm", query: "x", source: "s1" })));

    assert.ok(text.includes('FROM "MessageMention" mm'));
    assert.ok(text.includes('FROM "ThreadFollow" tf'));
    assert.ok(!text.includes("ILIKE"));
  });

  it("okunmamış anahtar listesi sayfalanmaz — yarısını okuyan bir tümü yalan söyler", () => {
    const text = sql(buildUnreadMentionKeysQuery(scope({ window: "all" })));

    assert.ok(!text.includes("LIMIT"));
    assert.ok(text.includes('"notificationId"'));
  });
});

describe("mentions query — thread lifecycle", () => {
  it("derives open from the root's real close timestamp", () => {
    const text = sql(buildThreadReplyCountQuery(["parent-1"]));

    assert.ok(text.includes('parent."threadClosedAt" IS NULL AS "open"'));
    assert.ok(!text.includes('BOOL_OR(parent."deletedAt" IS NULL)'));
  });
});

describe("mentions query — thread yanıt sayısı", () => {
  it("sayfadaki üst mesajlar için tek GROUP BY", () => {
    const text = sql(buildThreadReplyCountQuery(["p1", "p2"]));

    assert.ok(text.includes('GROUP BY m."threadParentId"'));
    assert.ok(text.includes('parent."threadClosedAt" IS NULL AS "open"'));
  });

  it("thread yoksa sorgu da yok", () => {
    assert.equal(buildThreadReplyCountQuery([]), null);
  });
});
