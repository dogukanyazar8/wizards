import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NotificationType } from "@wizards/db";
import type { NotifPanelTab } from "@wizards/types";

import {
  buildNotifPanelPageQuery,
  buildNotifPanelTabFilter,
  buildNotifUnreadCountsQuery,
  decodeNotifPanelCursor,
  encodeNotifPanelCursor,
  matchesNotifPanelTab,
  resolveNotifPanelBucket,
  toNotifKind,
  type NotifPanelBucket,
  type NotifPanelMetadata,
} from "@/lib/notifications/panel-query";

type Fixture = {
  readonly bucket: NotifPanelBucket;
  readonly metadata: NotifPanelMetadata;
  readonly name: string;
  readonly type: NotificationType;
};

/**
 * Her kova için en az bir gerçek satır şekli. `metadata` alanları üründe **yazılan** alanlar:
 * `message-notification-service.ts` thread yanıtına `parentMessageId` + `threadReplyPreview`
 * yazıyor, `events/notifications.ts` etkinliğe `eventId`.
 */
const FIXTURES: readonly Fixture[] = [
  {
    bucket: "mention",
    metadata: { channelId: "c1", senderId: "u1" },
    name: "kişi bahsetmesi",
    type: "MENTION",
  },
  {
    bucket: "mention",
    metadata: { mentionRole: "tasarım" },
    name: "rol bahsetmesi",
    type: "MENTION",
  },
  { bucket: "mention", metadata: null, name: "metadata'sız bahsetme", type: "MENTION" },
  {
    bucket: "reply",
    metadata: { parentMessageId: "m1", threadReplyPreview: "yüzey tokenları" },
    name: "thread yanıtı (SYSTEM + parentMessageId)",
    type: "SYSTEM",
  },
  {
    bucket: "reply",
    metadata: { kind: "thread" },
    name: "kind=thread geçersiz kılma",
    type: "SYSTEM",
  },
  {
    bucket: "reply",
    metadata: { kind: "reply" },
    name: "kind=reply geçersiz kılma",
    type: "MENTION",
  },
  {
    bucket: "event",
    metadata: { eventId: "e1", startsAt: "2026-08-24T12:00:00.000Z" },
    name: "etkinlik hatırlatması",
    type: "SYSTEM",
  },
  {
    bucket: "event",
    metadata: { kind: "event" },
    name: "kind=event geçersiz kılma",
    type: "SYSTEM",
  },
  { bucket: "system", metadata: { serverId: "s1" }, name: "düz sistem bildirimi", type: "SYSTEM" },
  { bucket: "system", metadata: null, name: "moderasyon", type: "MODERATION" },
  { bucket: "system", metadata: null, name: "geri bildirim", type: "FEEDBACK" },
  { bucket: "system", metadata: { badgeId: "founder" }, name: "rozet", type: "BADGE" },
  {
    bucket: "system",
    metadata: { inviteCode: "abc" },
    name: "sunucu daveti",
    type: "SERVER_INVITE",
  },
  {
    bucket: "system",
    metadata: { friendRequestId: "f1" },
    name: "arkadaşlık isteği",
    type: "FRIEND_REQUEST",
  },
  { bucket: "system", metadata: null, name: "arkadaşlık kabulü", type: "FRIEND_ACCEPTED" },
  { bucket: "other", metadata: { conversationId: "d1" }, name: "DM", type: "DM" },
  {
    bucket: "other",
    metadata: { kind: "mention", mentioned: true },
    name: "DM — metadata onu taşıyamaz",
    type: "DM",
  },
  {
    bucket: "system",
    metadata: { kind: "nonsense" },
    name: "tanınmayan kind yok sayılır",
    type: "SYSTEM",
  },
];

const TABS: readonly NotifPanelTab[] = ["all", "mentions", "replies", "system"];

describe("bildirim paneli — kova çözümü", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name} → ${fixture.bucket}`, () => {
      assert.equal(resolveNotifPanelBucket(fixture.type, fixture.metadata), fixture.bucket);
    });
  }

  it("metadata.kind yokken MENTION satırı mentions'a düşer (03 §1 varsayımı)", () => {
    // Yazan taraf (`message-notification-service`) `kind` doldurmuyor. Varsayım burada kilitli:
    // değişirse bu test kırılır, sekme sessizce boşalmaz.
    assert.equal(resolveNotifPanelBucket("MENTION", {}), "mention");
    assert.equal(resolveNotifPanelBucket("MENTION", null), "mention");
    assert.equal(matchesNotifPanelTab("mentions", resolveNotifPanelBucket("MENTION", {})), true);
  });

  it("mentions ve replies ayrık kümedir", () => {
    for (const fixture of FIXTURES) {
      const bucket = resolveNotifPanelBucket(fixture.type, fixture.metadata);
      const inMentions = matchesNotifPanelTab("mentions", bucket);
      const inReplies = matchesNotifPanelTab("replies", bucket);

      assert.equal(inMentions && inReplies, false, `${fixture.name} iki sekmede birden`);
    }
  });

  it("system sekmesi yedi türü kapsar", () => {
    const systemTypes: readonly NotificationType[] = [
      "SYSTEM",
      "MODERATION",
      "FEEDBACK",
      "BADGE",
      "SERVER_INVITE",
      "FRIEND_REQUEST",
      "FRIEND_ACCEPTED",
    ];

    for (const type of systemTypes) {
      assert.equal(
        matchesNotifPanelTab("system", resolveNotifPanelBucket(type, null)),
        true,
        `${type} sistem sekmesinde değil`,
      );
    }
  });

  it("DM yalnız `all` sekmesinde görünür", () => {
    const bucket = resolveNotifPanelBucket("DM", { conversationId: "d1" });

    assert.equal(matchesNotifPanelTab("all", bucket), true);
    assert.equal(matchesNotifPanelTab("mentions", bucket), false);
    assert.equal(matchesNotifPanelTab("replies", bucket), false);
    assert.equal(matchesNotifPanelTab("system", bucket), false);
  });

  it("`other` kovası dışarı `system` kind'i olarak çıkar (SPEC §7 dört değer)", () => {
    assert.equal(toNotifKind("other"), "system");
    assert.equal(toNotifKind("mention"), "mention");
    assert.equal(toNotifKind("reply"), "reply");
    assert.equal(toNotifKind("event"), "event");
  });

  it("her satır `all` dışında en fazla bir sekmeye düşer", () => {
    for (const fixture of FIXTURES) {
      const bucket = resolveNotifPanelBucket(fixture.type, fixture.metadata);
      const narrowTabs = TABS.filter((tab) => tab !== "all" && matchesNotifPanelTab(tab, bucket));

      assert.ok(narrowTabs.length <= 1, `${fixture.name} ${narrowTabs.length} dar sekmede`);
    }
  });
});

describe("bildirim paneli — SQL ikizi", () => {
  /**
   * SQL `CASE` ile TypeScript kovası aynı sırayı izlemek zorunda; ayrışırlarsa sekme pili bir
   * sayı, listenin kendisi başka bir sayı gösterir. Burada `CASE` dalları metin olarak okunup
   * fikstürler üzerinde **yürütülür**, yani ikisi tek örnek kümesiyle karşılaştırılır.
   */
  function evaluateBucketSql(fixture: Fixture): NotifPanelBucket {
    const kind = typeof fixture.metadata?.kind === "string" ? fixture.metadata.kind : null;
    const has = (key: string) => typeof fixture.metadata?.[key] === "string";

    if (fixture.type === "DM") return "other";
    if (kind === "mention") return "mention";
    if (kind === "reply" || kind === "thread") return "reply";
    if (kind === "event") return "event";
    if (kind === "system") return "system";
    if (fixture.type === "MENTION") return "mention";
    if (fixture.type === "SYSTEM" && (has("parentMessageId") || has("threadReplyPreview"))) {
      return "reply";
    }
    if (fixture.type === "SYSTEM" && has("eventId")) return "event";
    return "system";
  }

  it("CASE dallarının sırası TypeScript kovasıyla aynı", () => {
    for (const fixture of FIXTURES) {
      assert.equal(
        evaluateBucketSql(fixture),
        resolveNotifPanelBucket(fixture.type, fixture.metadata),
        fixture.name,
      );
    }
  });

  it("sayaç sorgusu tek geçiş, [userId, read, createdAt] ön ekiyle", () => {
    const query = buildNotifUnreadCountsQuery("user-1");
    const sql = query.sql.replace(/\s+/gu, " ");

    // `Prisma.sql` yer tutucuyu `?` olarak taşır; `$1`e sürücü çeviriyor.
    assert.match(sql, /FROM "Notification" WHERE "userId" = \? AND "read" = false/u);
    assert.equal((sql.match(/FROM "Notification"/gu) ?? []).length, 1);
    assert.equal((sql.match(/COUNT\(\*\) FILTER/gu) ?? []).length, 3);
    // `::int` olmadan Prisma `BigInt` taşır ve `JSON.stringify` o değerde patlar.
    assert.equal((sql.match(/::int/gu) ?? []).length, 4);
    assert.deepEqual(query.values, ["user-1"]);
  });

  it("sekme süzgeci `all` için yoktur, diğer üçü için kovaya bakar", () => {
    assert.equal(buildNotifPanelTabFilter("all"), null);
    assert.match(buildNotifPanelTabFilter("mentions")?.sql ?? "", /= 'mention'/u);
    assert.match(buildNotifPanelTabFilter("replies")?.sql ?? "", /= 'reply'/u);
    assert.match(buildNotifPanelTabFilter("system")?.sql ?? "", /IN \('system', 'event'\)/u);
  });

  it("sayfa sorgusu keyset sıralı ve bir fazla satır ister", () => {
    const query = buildNotifPanelPageQuery({
      cursor: { createdAt: new Date("2026-08-24T09:00:00.000Z"), id: "n6" },
      limit: 6,
      tab: "system",
      userId: "user-1",
    });
    const sql = query.sql.replace(/\s+/gu, " ");

    assert.match(sql, /ORDER BY "createdAt" DESC, "id" DESC/u);
    assert.match(sql, /"createdAt" < \? OR \("createdAt" = \? AND "id" < \?\)/u);
    // Son değer `limit + 1`: fazlalık yanıta girmez, yalnız "sonraki sayfa var" der.
    assert.equal(query.values.at(-1), 7);
    assert.equal(query.values[0], "user-1");
  });

  it("imleçsiz sayfa sorgusu imleç koşulu taşımaz", () => {
    const query = buildNotifPanelPageQuery({ cursor: null, limit: 6, tab: "all", userId: "u" });

    assert.doesNotMatch(query.sql, /"createdAt" </u);
    assert.doesNotMatch(query.sql, /CASE/u);
  });
});

describe("bildirim paneli — imleç", () => {
  it("gidiş dönüş aynı çifti verir", () => {
    const cursor = { createdAt: new Date("2026-08-24T09:41:00.000Z"), id: "n1" };
    const decoded = decodeNotifPanelCursor(encodeNotifPanelCursor(cursor));

    assert.equal(decoded?.id, "n1");
    assert.equal(decoded?.createdAt.toISOString(), "2026-08-24T09:41:00.000Z");
  });

  it("bozuk, boş ve geçersiz tarihli imleçler `null` döner", () => {
    assert.equal(decodeNotifPanelCursor(undefined), null);
    assert.equal(decodeNotifPanelCursor(""), null);
    assert.equal(decodeNotifPanelCursor("bozuk"), null);
    assert.equal(
      decodeNotifPanelCursor(Buffer.from("tarih-değil|n1", "utf8").toString("base64url")),
      null,
    );
    assert.equal(
      decodeNotifPanelCursor(
        Buffer.from("2026-08-24T09:41:00.000Z|", "utf8").toString("base64url"),
      ),
      null,
    );
  });
});
