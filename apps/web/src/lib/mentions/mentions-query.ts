import { Prisma } from "@wizards/db";
import {
  formatMentionId,
  type MentionFilter,
  type MentionStateSource,
  type MentionWindow,
} from "@wizards/types";

/**
 * Bahsedilmeler — Dalga 1 / Ş3. Akışın **tek** sorgusu.
 *
 * Ekran dört ayrı kaynaktan besleniyor ve dördü tek sıralı sayfa hâlinde okunuyor:
 *
 * | Dal        | Kaynak                                               | `stateKey`          |
 * | ---------- | ---------------------------------------------------- | ------------------- |
 * | `channel`  | `MessageMention` (`kind` = `SELF` veya `ROLE`)        | `channel` / `mm.id` |
 * | `dm`       | `DMMessageMention`                                   | `dm` / `dmm.id`     |
 * | `everyone` | `Message.mentionEveryone` (karar K2 — satır yazılmaz) | `everyone` / `m.id` |
 * | `thread`   | `ThreadFollow` ile `Message.threadParentId` (K3)      | `thread` / `m.id`   |
 *
 * Üç kural bu dosyada, dört yerde tekrar edilmesin diye:
 *
 * 1. **Görünürlük sorgunun kendi süzgecidir**, sonucuna uygulanan bir kontrol değil. Kanal
 *    erişimi `resolveHomeChannelAccess`ten gelen kimlik listesiyle, DM üyeliği `DMParticipant`
 *    join'iyle, `historyFromAt` sınırı ve `deletedAt`/`placeholderRemovedAt`/`expiresAt` ile.
 *    Okuyamadığı bir kanalın bahsetmesi, sorgunun kurulduğu kümede **yok**.
 * 2. **Okundu birleşiktir** (Dalga 0 raporu, devir notu 2):
 *    `unread = (MentionState.readAt IS NULL) AND COALESCE(Notification.read, TRUE) = FALSE`.
 *    `MentionState` satırı tembel doğar; yoksa `Notification` belirler. Bildirim satırı olmayan
 *    bahsetme **okunmuş** sayılır — sessize alınmış kanal ya da satır öncesi geçmiş hiçbir
 *    zaman bekleyen olmamıştır (tuzak #2). Bu kural gevşetilirse eski bahsetmeler bir gecede
 *    okunmamışa döner ve sayaç patlar.
 * 3. **`Sonra oku` her zaman üsttedir** (K5). Sıralama `(readLaterFirst, occurredAt, id)`
 *    ve imleç aynı üçlüyü taşır; filtre ya da gruplama değişse de kart yerinde kalır.
 *
 * Sayfa **iki** sorgu eder: bu birleşik sorgu, sonra sayfadaki thread üst mesajları için tek
 * bir `GROUP BY` yanıt sayımı. Yanıt sayısını dalın `SELECT`ine korelasyonlu alt sorgu olarak
 * koymak, `LIMIT` uygulanmadan **önce** eşleşen her satır için çalışması demekti.
 */

/**
 * `Notification.dedupeKey` önekleri. Kaynak: `message-notification-service.ts` ve
 * `dm/notification-service.ts` — okuma tarafı bu dizeleri **üretmez**, yalnız eşler.
 *
 * `everyone` öneki bugün hiçbir yazıcı tarafından üretilmiyor: kitlesel çağrının bildirimi
 * Ş2'nin işi. O gelene kadar `COALESCE(n."read", TRUE)` kuralı `@herkes` kartlarını okunmuş
 * gösterir, ki doğru olan da budur — bekleyen bir bildirim hiç olmadı.
 */
export const MENTION_DEDUPE_PREFIX = {
  channel: "channel-mention:",
  dm: "dm-message:",
  everyone: "channel-everyone:",
  thread: "channel-thread-reply:",
} as const satisfies Record<MentionStateSource, string>;

/** `MentionStateSource` tel yazımı (küçük harf) ile Postgres enum etiketi (büyük harf). */
const STATE_SOURCE_ENUM: Record<MentionStateSource, string> = {
  channel: "CHANNEL",
  dm: "DM",
  everyone: "EVERYONE",
  thread: "THREAD",
};

export const MENTIONS_WINDOW_DAYS = 30;

/** Karar K7: 30 gün bir sorgu penceresidir, yıkıcı iş değil. `all` sınırsızdır. */
export function resolveMentionWindowStart(window: MentionWindow, now: Date): Date | null {
  return window === "all"
    ? null
    : new Date(now.getTime() - MENTIONS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// İmleç
// ---------------------------------------------------------------------------

/**
 * Sıralama üç anahtarlıdır, imleç de öyle. `readLaterFirst` olmadan sabitlenmiş bir kart
 * ikinci sayfada bir daha görünürdü: `occurredAt` ona göre çok eski.
 */
export type MentionCursor = {
  readonly id: string;
  readonly occurredAt: Date;
  readonly readLaterFirst: boolean;
};

export function encodeMentionCursor(cursor: MentionCursor): string {
  const flag = cursor.readLaterFirst ? "1" : "0";
  return Buffer.from(`${flag}|${cursor.occurredAt.toISOString()}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

export function decodeMentionCursor(raw: string | null | undefined): MentionCursor | null {
  if (!raw) {
    return null;
  }

  const [flag, iso, ...rest] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  // Bahsetme kimliği bileşik ve ayracı da iki nokta; imleçte ayraç `|` olduğu için kalan
  // parçalar geri birleştirilir.
  const id = rest.join("|");
  if ((flag !== "0" && flag !== "1") || !iso || !id) {
    return null;
  }

  const occurredAt = new Date(iso);
  return Number.isNaN(occurredAt.getTime())
    ? null
    : { id, occurredAt, readLaterFirst: flag === "1" };
}

// ---------------------------------------------------------------------------
// Arama
// ---------------------------------------------------------------------------

/**
 * `ILIKE` kalıbı. `%` ve `_` kullanıcı metninde **veri**dir; kaçırılmazsa `%` yazan biri
 * bütün satırları eşleştirir ve arama sessizce filtresiz kalır.
 */
export function toMentionSearchPattern(query: string): string {
  const escaped = query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  return `%${escaped}%`;
}

// ---------------------------------------------------------------------------
// Dal seçimi
// ---------------------------------------------------------------------------

export type MentionBranch = MentionStateSource;

export type MentionQueryScope = {
  readonly channelIds: readonly string[];
  readonly filter: MentionFilter;
  /**
   * Akış `dismissed` kartları göstermez; tek bahsetme okuması gösterir. Kartı listeden
   * kaldıran istek, kaldırdığı kartın son hâlini geri alabilmelidir — aksi halde eylem
   * kendi yanıtını 404 yapar.
   */
  readonly includeDismissed?: boolean | undefined;
  readonly now: Date;
  readonly query: string | null;
  /** Sunucu kimliği ya da `"dm"`; seçim yoksa `null`. */
  readonly source: string | null;
  readonly userId: string;
  readonly window: MentionWindow;
};

const DM_SOURCE_KEY = "dm";

/**
 * Hangi dalların **kurulacağı**. Bir dalı kurup sonucunu elemek yerine hiç kurmamak, filtre
 * daraldıkça sorgunun da daralması demek: `DM` sekmesi kanal tablolarına hiç bakmaz.
 *
 * `role` sekmesi (`Rol · @herkes`) iki dal birden açar — tasarımda tek sekme, veride iki
 * kaynak (SPEC §4, karar K2).
 */
export function selectMentionBranches(
  filter: MentionFilter,
  source: string | null,
): readonly MentionBranch[] {
  let byFilter: readonly MentionBranch[];

  switch (filter) {
    case "dm":
      byFilter = ["dm"];
      break;
    case "role":
      byFilter = ["channel", "everyone"];
      break;
    case "thread":
      byFilter = ["thread"];
      break;
    case "me":
      byFilter = ["channel", "dm"];
      break;
    default:
      byFilter = ["channel", "dm", "everyone", "thread"];
  }

  if (source === DM_SOURCE_KEY) {
    return byFilter.filter((branch) => branch === "dm");
  }

  // Bir sunucu seçiliyse DM dalı hiç kurulmaz: DM'lerin sunucusu yoktur ve dal her satırını
  // dışarıda eleyerek boşuna okunurdu.
  return source ? byFilter.filter((branch) => branch !== "dm") : byFilter;
}

// ---------------------------------------------------------------------------
// Satır
// ---------------------------------------------------------------------------

export type MentionQueryRow = {
  authorAvatarUrl: string | null;
  authorDisplayName: string | null;
  authorId: string;
  authorUsername: string;
  channelId: string;
  channelName: string | null;
  content: string;
  conversationTitle: string | null;
  dismissed: boolean;
  kind: string;
  mentionId: string;
  messageId: string;
  notificationId: string | null;
  occurredAt: Date;
  quoteAuthorName: string | null;
  quoteText: string | null;
  readLaterFirst: boolean;
  refId: string;
  roleName: string | null;
  serverId: string | null;
  serverName: string | null;
  sourceKey: string;
  stateSource: MentionStateSource;
  threadParentId: string | null;
  unread: boolean;
};

// ---------------------------------------------------------------------------
// Ortak parçalar
// ---------------------------------------------------------------------------

function mentionStateJoin(userId: string, source: MentionStateSource, ref: Prisma.Sql): Prisma.Sql {
  const label = Prisma.raw(`'${STATE_SOURCE_ENUM[source]}'`);

  return Prisma.sql`
    LEFT JOIN "MentionState" ms
      ON ms."userId" = ${userId}
     AND ms."source" = ${label}::"MentionStateSource"
     AND ms."refId" = ${ref}
  `;
}

function notificationJoin(
  source: MentionStateSource,
  messageId: Prisma.Sql,
  userId: string,
): Prisma.Sql {
  return Prisma.sql`
    LEFT JOIN "Notification" n
      ON n."dedupeKey" = ${MENTION_DEDUPE_PREFIX[source]} || ${messageId} || ':' || ${userId}
  `;
}

const UNREAD_EXPRESSION = Prisma.sql`(ms."readAt" IS NULL AND COALESCE(n."read", TRUE) = FALSE)`;
const READ_LATER_EXPRESSION = Prisma.sql`(ms."readLaterAt" IS NOT NULL)`;

/**
 * `dismissedAt` dolu kart akıştan düşer. Mesaj silinmez — bu bir görünürlük kararıdır ve
 * kartın kanaldaki karşılığı yerinde durur.
 */
function notDismissed(scope: MentionQueryScope): Prisma.Sql {
  return scope.includeDismissed ? Prisma.empty : Prisma.sql`AND ms."dismissedAt" IS NULL`;
}

function windowFilter(column: Prisma.Sql, windowStart: Date | null): Prisma.Sql {
  return windowStart ? Prisma.sql`AND ${column} > ${windowStart}` : Prisma.empty;
}

function unreadFilter(filter: MentionFilter): Prisma.Sql {
  return filter === "unread" ? Prisma.sql`AND ${UNREAD_EXPRESSION}` : Prisma.empty;
}

function cursorFilter(
  cursor: MentionCursor | null,
  mentionId: Prisma.Sql,
  occurredAt: Prisma.Sql,
): Prisma.Sql {
  if (!cursor) {
    return Prisma.empty;
  }

  // Satır demeti karşılaştırması `ORDER BY ... DESC` ile birebir aynı sırayı okur; üç ayrı
  // `OR` zinciri yazmak aynı şeyi söyler ama bir gün biri sıralamayı değiştirip zinciri
  // güncellemeyi unutur.
  return Prisma.sql`AND (${READ_LATER_EXPRESSION}, ${occurredAt}, ${mentionId})
    < (${cursor.readLaterFirst}, ${cursor.occurredAt}, ${cursor.id})`;
}

function channelSearchFilter(pattern: string | null): Prisma.Sql {
  if (!pattern) {
    return Prisma.empty;
  }

  return Prisma.sql`AND (
    m."content" ILIKE ${pattern}
    OR u."username" ILIKE ${pattern}
    OR COALESCE(u."displayName", '') ILIKE ${pattern}
    OR c."name" ILIKE ${pattern}
    OR s."name" ILIKE ${pattern}
  )`;
}

function serverFilter(source: string | null): Prisma.Sql {
  return source && source !== DM_SOURCE_KEY
    ? Prisma.sql`AND c."serverId" = ${source}`
    : Prisma.empty;
}

function channelScope(channelIds: readonly string[]): Prisma.Sql {
  return Prisma.sql`AND m."channelId" IN (${Prisma.join([...channelIds])})`;
}

type BranchBuilder = (
  scope: MentionQueryScope,
  cursor: MentionCursor | null,
  windowStart: Date | null,
  pattern: string | null,
) => Prisma.Sql;

// ---------------------------------------------------------------------------
// Dallar
// ---------------------------------------------------------------------------

/**
 * `SELF` ve `ROLE`. `THREAD` bu daldan **çıkarılır**: takip edilen thread'in yanıtı
 * `ThreadFollow` dalından gelir ve iki dal aynı satırı üretirse kart akışta iki kez çıkar.
 */
const channelBranch: BranchBuilder = (scope, cursor, windowStart, pattern) => {
  let kinds: Prisma.Sql;

  if (scope.filter === "role") {
    kinds = Prisma.sql`AND mm."kind" = 'ROLE'::"MentionKind"`;
  } else if (scope.filter === "me") {
    kinds = Prisma.sql`AND mm."kind" = 'SELF'::"MentionKind"`;
  } else {
    kinds = Prisma.sql`AND mm."kind" IN ('SELF'::"MentionKind", 'ROLE'::"MentionKind")`;
  }

  return Prisma.sql`
    SELECT
      'channel:' || mm."id" AS "mentionId",
      'channel' AS "stateSource",
      mm."id" AS "refId",
      CASE WHEN mm."kind" = 'ROLE'::"MentionKind" THEN 'role' ELSE 'me' END AS "kind",
      mm."createdAt" AS "occurredAt",
      ${READ_LATER_EXPRESSION} AS "readLaterFirst",
      ${UNREAD_EXPRESSION} AS "unread",
      (ms."dismissedAt" IS NOT NULL) AS "dismissed",
      m."id" AS "messageId",
      m."content" AS "content",
      n."id" AS "notificationId",
      m."channelId" AS "channelId",
      c."name" AS "channelName",
      c."serverId" AS "serverId",
      s."name" AS "serverName",
      NULL::text AS "conversationTitle",
      c."serverId" AS "sourceKey",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl",
      r."name" AS "roleName",
      COALESCE(ru."displayName", ru."username") AS "quoteAuthorName",
      rm."content" AS "quoteText",
      m."threadParentId" AS "threadParentId"
    FROM "MessageMention" mm
    INNER JOIN "Message" m ON m."id" = mm."messageId"
    INNER JOIN "Channel" c ON c."id" = m."channelId"
    INNER JOIN "Server" s ON s."id" = c."serverId"
    INNER JOIN "User" u ON u."id" = m."userId"
    LEFT JOIN "Role" r ON r."id" = mm."roleId"
    LEFT JOIN "Message" rm ON rm."id" = m."replyToId"
    LEFT JOIN "User" ru ON ru."id" = rm."userId"
    ${notificationJoin("channel", Prisma.sql`mm."messageId"`, scope.userId)}
    ${mentionStateJoin(scope.userId, "channel", Prisma.sql`mm."id"`)}
    WHERE mm."userId" = ${scope.userId}
      AND m."deletedAt" IS NULL
      AND m."placeholderRemovedAt" IS NULL
      ${channelScope(scope.channelIds)}
      ${kinds}
      ${serverFilter(scope.source)}
      ${windowFilter(Prisma.sql`mm."createdAt"`, windowStart)}
      ${channelSearchFilter(pattern)}
      ${unreadFilter(scope.filter)}
      ${notDismissed(scope)}
      ${cursorFilter(cursor, Prisma.sql`'channel:' || mm."id"`, Prisma.sql`mm."createdAt"`)}
  `;
};

const directMessageBranch: BranchBuilder = (scope, cursor, windowStart, pattern) => {
  const search = pattern
    ? Prisma.sql`AND (
        m."content" ILIKE ${pattern}
        OR u."username" ILIKE ${pattern}
        OR COALESCE(u."displayName", '') ILIKE ${pattern}
        OR COALESCE(conv."name", '') ILIKE ${pattern}
      )`
    : Prisma.empty;

  return Prisma.sql`
    SELECT
      'dm:' || dmm."id" AS "mentionId",
      'dm' AS "stateSource",
      dmm."id" AS "refId",
      'me' AS "kind",
      dmm."createdAt" AS "occurredAt",
      ${READ_LATER_EXPRESSION} AS "readLaterFirst",
      ${UNREAD_EXPRESSION} AS "unread",
      (ms."dismissedAt" IS NOT NULL) AS "dismissed",
      m."id" AS "messageId",
      m."content" AS "content",
      n."id" AS "notificationId",
      m."conversationId" AS "channelId",
      NULL::text AS "channelName",
      NULL::text AS "serverId",
      NULL::text AS "serverName",
      -- 1:1 konuşmanın adı yoktur ve karşı taraf zaten bu mesajın yazarıdır. Adsız grup
      -- başlığı servis katmanında tek toplu katılımcı sorgusuyla yerelleştirilerek tamamlanır.
      COALESCE(conv."name", u."displayName", u."username") AS "conversationTitle",
      'dm' AS "sourceKey",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl",
      NULL::text AS "roleName",
      COALESCE(ru."displayName", ru."username") AS "quoteAuthorName",
      rm."content" AS "quoteText",
      m."threadParentId" AS "threadParentId"
    FROM "DMMessageMention" dmm
    INNER JOIN "DMMessage" m ON m."id" = dmm."messageId"
    INNER JOIN "DMConversation" conv ON conv."id" = m."conversationId"
    INNER JOIN "User" u ON u."id" = m."userId"
    INNER JOIN "DMParticipant" p
      ON p."conversationId" = m."conversationId" AND p."userId" = ${scope.userId}
    LEFT JOIN "DMMessage" rm ON rm."id" = m."replyToId"
    LEFT JOIN "User" ru ON ru."id" = rm."userId"
    ${notificationJoin("dm", Prisma.sql`dmm."messageId"`, scope.userId)}
    ${mentionStateJoin(scope.userId, "dm", Prisma.sql`dmm."id"`)}
    WHERE dmm."userId" = ${scope.userId}
      AND m."deletedAt" IS NULL
      AND m."placeholderRemovedAt" IS NULL
      AND (m."expiresAt" IS NULL OR m."expiresAt" > ${scope.now})
      -- 2c §7: kırpılmış geçmişe katılan üye arkasını okuyamaz; arkasındaki bahsetme de
      -- onun göreceği bir şey değildir.
      AND (p."historyFromAt" IS NULL OR m."createdAt" >= p."historyFromAt")
      ${windowFilter(Prisma.sql`dmm."createdAt"`, windowStart)}
      ${search}
      ${unreadFilter(scope.filter)}
      ${notDismissed(scope)}
      ${cursorFilter(cursor, Prisma.sql`'dm:' || dmm."id"`, Prisma.sql`dmm."createdAt"`)}
  `;
};

/**
 * Karar K2. Kitlesel çağrının satırı yoktur: `Message.mentionEveryone` bayrağı gönderimde ve
 * düzenlemede zaten yazılıyor (`message-service.ts:835,1022`) ve geçmiş veri dahil dolu.
 * Kısmi indeks (`Message_mentionEveryone_channelId_createdAt_idx`) bu dalın tek dayanağı.
 *
 * Yazar kendi çağrısını görmez: `@herkes` yazan kişiye kendi mesajını bahsetme diye
 * göstermek, gönder tuşuna basmanın karşılığı olarak bir kart üretmek demekti.
 */
const everyoneBranch: BranchBuilder = (scope, cursor, windowStart, pattern) => Prisma.sql`
    SELECT
      'everyone:' || m."id" AS "mentionId",
      'everyone' AS "stateSource",
      m."id" AS "refId",
      'everyone' AS "kind",
      m."createdAt" AS "occurredAt",
      ${READ_LATER_EXPRESSION} AS "readLaterFirst",
      ${UNREAD_EXPRESSION} AS "unread",
      (ms."dismissedAt" IS NOT NULL) AS "dismissed",
      m."id" AS "messageId",
      m."content" AS "content",
      n."id" AS "notificationId",
      m."channelId" AS "channelId",
      c."name" AS "channelName",
      c."serverId" AS "serverId",
      s."name" AS "serverName",
      NULL::text AS "conversationTitle",
      c."serverId" AS "sourceKey",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl",
      NULL::text AS "roleName",
      COALESCE(ru."displayName", ru."username") AS "quoteAuthorName",
      rm."content" AS "quoteText",
      m."threadParentId" AS "threadParentId"
    FROM "Message" m
    INNER JOIN "Channel" c ON c."id" = m."channelId"
    INNER JOIN "Server" s ON s."id" = c."serverId"
    INNER JOIN "User" u ON u."id" = m."userId"
    LEFT JOIN "Message" rm ON rm."id" = m."replyToId"
    LEFT JOIN "User" ru ON ru."id" = rm."userId"
    ${notificationJoin("everyone", Prisma.sql`m."id"`, scope.userId)}
    ${mentionStateJoin(scope.userId, "everyone", Prisma.sql`m."id"`)}
    WHERE m."mentionEveryone" = TRUE
      AND m."userId" <> ${scope.userId}
      AND m."deletedAt" IS NULL
      AND m."placeholderRemovedAt" IS NULL
      ${channelScope(scope.channelIds)}
      ${serverFilter(scope.source)}
      ${windowFilter(Prisma.sql`m."createdAt"`, windowStart)}
      ${channelSearchFilter(pattern)}
      ${unreadFilter(scope.filter)}
      ${notDismissed(scope)}
      ${cursorFilter(cursor, Prisma.sql`'everyone:' || m."id"`, Prisma.sql`m."createdAt"`)}
  `;

/**
 * Karar K3. Takip `ThreadFollow` satırıdır; `mutedAt` dolu bir takip akışa hiçbir şey vermez
 * ama satır durur, çünkü silinseydi bir sonraki örtük tetikleyici takibi sessizce geri açardı.
 */
const threadBranch: BranchBuilder = (scope, cursor, windowStart, pattern) => Prisma.sql`
    SELECT
      'thread:' || m."id" AS "mentionId",
      'thread' AS "stateSource",
      m."id" AS "refId",
      'thread' AS "kind",
      m."createdAt" AS "occurredAt",
      ${READ_LATER_EXPRESSION} AS "readLaterFirst",
      ${UNREAD_EXPRESSION} AS "unread",
      (ms."dismissedAt" IS NOT NULL) AS "dismissed",
      m."id" AS "messageId",
      m."content" AS "content",
      n."id" AS "notificationId",
      m."channelId" AS "channelId",
      c."name" AS "channelName",
      c."serverId" AS "serverId",
      s."name" AS "serverName",
      NULL::text AS "conversationTitle",
      c."serverId" AS "sourceKey",
      u."id" AS "authorId",
      u."username" AS "authorUsername",
      u."displayName" AS "authorDisplayName",
      u."avatarUrl" AS "authorAvatarUrl",
      NULL::text AS "roleName",
      COALESCE(ru."displayName", ru."username") AS "quoteAuthorName",
      rm."content" AS "quoteText",
      m."threadParentId" AS "threadParentId"
    FROM "ThreadFollow" tf
    INNER JOIN "Message" m ON m."threadParentId" = tf."parentMessageId"
    INNER JOIN "Channel" c ON c."id" = m."channelId"
    INNER JOIN "Server" s ON s."id" = c."serverId"
    INNER JOIN "User" u ON u."id" = m."userId"
    LEFT JOIN "Message" rm ON rm."id" = m."replyToId"
    LEFT JOIN "User" ru ON ru."id" = rm."userId"
    ${notificationJoin("thread", Prisma.sql`m."id"`, scope.userId)}
    ${mentionStateJoin(scope.userId, "thread", Prisma.sql`m."id"`)}
    WHERE tf."userId" = ${scope.userId}
      AND tf."mutedAt" IS NULL
      AND m."userId" <> ${scope.userId}
      AND m."deletedAt" IS NULL
      AND m."placeholderRemovedAt" IS NULL
      ${channelScope(scope.channelIds)}
      ${serverFilter(scope.source)}
      ${windowFilter(Prisma.sql`m."createdAt"`, windowStart)}
      ${channelSearchFilter(pattern)}
      ${unreadFilter(scope.filter)}
      ${notDismissed(scope)}
      ${cursorFilter(cursor, Prisma.sql`'thread:' || m."id"`, Prisma.sql`m."createdAt"`)}
  `;

const BRANCH_BUILDERS: Record<MentionBranch, BranchBuilder> = {
  channel: channelBranch,
  dm: directMessageBranch,
  everyone: everyoneBranch,
  thread: threadBranch,
};

/**
 * `UNION ALL` gövdesi, ya da hiç dal kalmadıysa `null`.
 *
 * Kanal listesi boşken kanal dalları hiç kurulmaz: `IN ()` geçersiz SQL'dir ve `IN (NULL)`
 * sessizce hiçbir şey eşleştirir — ikisi de bir sorgu değil, bir kaza.
 */
export function buildMentionUnion(
  scope: MentionQueryScope,
  cursor: MentionCursor | null = null,
): Prisma.Sql | null {
  const windowStart = resolveMentionWindowStart(scope.window, scope.now);
  const pattern = scope.query ? toMentionSearchPattern(scope.query) : null;
  const hasChannels = scope.channelIds.length > 0;

  const branches = selectMentionBranches(scope.filter, scope.source)
    .filter((branch) => hasChannels || branch === "dm")
    .map((branch) => BRANCH_BUILDERS[branch](scope, cursor, windowStart, pattern));

  return branches.length === 0 ? null : Prisma.join(branches, " UNION ALL ");
}

export const MENTION_ORDER_BY = Prisma.sql`
  ORDER BY "readLaterFirst" DESC, "occurredAt" DESC, "mentionId" DESC
`;

export function buildMentionPageQuery(
  scope: MentionQueryScope,
  cursor: MentionCursor | null,
  limit: number,
): Prisma.Sql | null {
  const union = buildMentionUnion(scope, cursor);
  if (!union) {
    return null;
  }

  return Prisma.sql`
    SELECT * FROM (${union}) mentions
    ${MENTION_ORDER_BY}
    LIMIT ${limit + 1}
  `;
}

/** Exact filtered total. Pagination cursor is deliberately absent. */
export function buildMentionTotalQuery(scope: MentionQueryScope): Prisma.Sql | null {
  const union = buildMentionUnion(scope, null);
  if (!union) {
    return null;
  }

  return Prisma.sql`
    SELECT COUNT(*)::int AS "total"
    FROM (${union}) mentions
  `;
}

// ---------------------------------------------------------------------------
// Sayaçlar
// ---------------------------------------------------------------------------

export type MentionCountsRow = {
  all: number;
  bySource: Record<string, number> | null;
  everyone: number;
  me: number;
  readLater: number;
  role: number;
  thread: number;
  unread: number;
};

export const EMPTY_MENTION_COUNTS_ROW: MentionCountsRow = {
  all: 0,
  bySource: {},
  everyone: 0,
  me: 0,
  readLater: 0,
  role: 0,
  thread: 0,
  unread: 0,
};

/**
 * Bütün sayılar **tek** taramadan. Ray satırları, sekmeler ve gezinme paneli rozeti aynı
 * nesneden okur; ikinci bir toplama yazılırsa ikisi bir gün ayrışır (karar K4).
 *
 * `bySource` aynı CTE üzerinden okunur; ayrı bir sorgu olsaydı iki tarama arasında yazılan
 * bir bahsetme sekme sayısıyla kaynak sayısını çelişkiye düşürürdü.
 */
export function buildMentionCountsQuery(scope: MentionQueryScope): Prisma.Sql | null {
  // Sayaç ekranın filtresinden bağımsızdır: ray bütün türlerin sayısını aynı anda gösterir.
  const union = buildMentionUnion({ ...scope, filter: "all", query: null, source: null }, null);
  if (!union) {
    return null;
  }

  return Prisma.sql`
    WITH mentions AS (${union})
    SELECT
      (SELECT COUNT(*) FROM mentions)::int AS "all",
      (SELECT COUNT(*) FROM mentions WHERE "unread")::int AS "unread",
      (SELECT COUNT(*) FROM mentions WHERE "kind" = 'me')::int AS "me",
      (SELECT COUNT(*) FROM mentions WHERE "kind" = 'role')::int AS "role",
      (SELECT COUNT(*) FROM mentions WHERE "kind" = 'everyone')::int AS "everyone",
      (SELECT COUNT(*) FROM mentions WHERE "kind" = 'thread')::int AS "thread",
      (SELECT COUNT(*) FROM mentions WHERE "readLaterFirst")::int AS "readLater",
      (
        SELECT COALESCE(json_object_agg("sourceKey", "sourceCount"), '{}'::json)
        FROM (
          SELECT "sourceKey", COUNT(*)::int AS "sourceCount"
          FROM mentions
          GROUP BY "sourceKey"
        ) grouped
      ) AS "bySource"
  `;
}

/**
 * Tek bahsetme — `PATCH .../state` yazdıktan sonra güncel kartı döndürmek için.
 *
 * Pencere burada her zaman `all`: 30 günden eski bir karta dokunmak onu yok saymaz.
 */
export function buildMentionByKeyQuery(
  scope: MentionQueryScope,
  key: { readonly refId: string; readonly source: MentionStateSource },
): Prisma.Sql | null {
  const union = buildMentionUnion(
    {
      ...scope,
      filter: "all",
      includeDismissed: true,
      query: null,
      source: null,
      window: "all",
    },
    null,
  );
  if (!union) {
    return null;
  }

  return Prisma.sql`
    SELECT * FROM (${union}) mentions
    WHERE "mentionId" = ${formatMentionId(key)}
    LIMIT 1
  `;
}

/**
 * Okunmamışların `stateKey` listesi — `read-all` bunu yazar, geri alma bunu geri koyar.
 * Sayfalama yok: eylem "hepsi" diyor ve yarısını okuyan bir "hepsi" yalan söyler.
 */
export function buildUnreadMentionKeysQuery(scope: MentionQueryScope): Prisma.Sql | null {
  const union = buildMentionUnion({ ...scope, filter: "unread", query: null, source: null }, null);
  if (!union) {
    return null;
  }

  return Prisma.sql`
    SELECT "mentionId", "stateSource", "refId", "notificationId"
    FROM (${union}) mentions
  `;
}

export type UnreadMentionKeyRow = {
  mentionId: string;
  notificationId: string | null;
  refId: string;
  stateSource: MentionStateSource;
};

/**
 * Sayfadaki thread üst mesajlarının yanıt sayısı. Sayfa en fazla 50 satır, bu yüzden tek
 * `GROUP BY` yeter; korelasyonlu alt sorgu `LIMIT`ten **önce** her eşleşen satır için koşardı.
 *
 * `open` kök mesajın gerçek lifecycle alanından gelir; silme ile kapatma ayrı davranışlardır.
 */
export function buildThreadReplyCountQuery(parentIds: readonly string[]): Prisma.Sql | null {
  if (parentIds.length === 0) {
    return null;
  }

  return Prisma.sql`
    SELECT
      m."threadParentId" AS "parentId",
      COUNT(*)::int AS "replyCount",
      parent."threadClosedAt" IS NULL AS "open"
    FROM "Message" m
    INNER JOIN "Message" parent ON parent."id" = m."threadParentId"
    WHERE m."threadParentId" IN (${Prisma.join([...parentIds])})
      AND m."deletedAt" IS NULL
    GROUP BY m."threadParentId", parent."threadClosedAt"
  `;
}

export type ThreadReplyCountRow = {
  open: boolean;
  parentId: string;
  replyCount: number;
};
