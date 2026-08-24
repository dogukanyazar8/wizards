import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@wizards/db";
import type {
  Mention,
  MentionContext,
  MentionContextMessage,
  MentionCounts,
  MentionFilter,
  MentionKind,
  MentionListResponse,
  MentionSource,
  MentionStateKey,
  MentionStateSource,
  MentionWindow,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { resolveAppOrigin } from "@/lib/app-origin";
import { buildMentionHref } from "@/lib/home/href";
import {
  defaultVisibleChannelResolver,
  resolveHomeChannelAccess,
  type VisibleChannelResolver,
} from "@/lib/home/service";
import { toInitials } from "@/lib/messages/rail-presentation";
import { getGroupConversationTitle } from "@/lib/dm/group-presentation";
import { normalizeAppLocale } from "@/lib/locale";
import {
  EMPTY_MENTION_COUNTS_ROW,
  MENTION_DEDUPE_PREFIX,
  buildMentionByKeyQuery,
  buildMentionCountsQuery,
  buildMentionPageQuery,
  buildMentionTotalQuery,
  buildThreadReplyCountQuery,
  buildUnreadMentionKeysQuery,
  decodeMentionCursor,
  encodeMentionCursor,
  type MentionCountsRow,
  type MentionQueryRow,
  type MentionQueryScope,
  type ThreadReplyCountRow,
  type UnreadMentionKeyRow,
} from "@/lib/mentions/mentions-query";
import { getRedisOp } from "@/lib/redis";

/**
 * Bahsedilmeler — Dalga 1 / Ş3. Ekranın beslendiği bütün uçların gövdesi.
 *
 * Sorgu `mentions-query.ts`te; burada üç şey var: satırı karta çevirmek, okundu durumunu
 * **iki tarafa birden** yazmak, ve `Tümünü okundu işaretle` eylemini geri alınabilir kılmak.
 *
 * Okundu yazımının iki tarafı olmasının sebebi tarihsel: bahsetmenin okunma bilgisi bugüne
 * kadar yalnız `Notification` satırındaydı ve o satır zil menüsünün de kaynağı. Yeni
 * `MentionState` tablosu onu değiştirmez, üstüne biner — `readAt` yazılırken ilgili bildirim
 * de okunur, `Okunmadı işaretle` ikisini birden geri alır. Tek taraf yazılsaydı zil menüsü ile
 * bahsetme kartı aynı olay hakkında farklı şey söylerdi.
 *
 * `notifications/service.ts: markRead` yolundan bilerek geçilmiyor: o yol
 * `releaseChannelMention` ile `ChannelReadState.mentionCount` sayacını da düşürür ve karar K4
 * o sayacı kanal satırı rozetine bırakıyor. Bu ekranda bir kartı okumak, kanalın kendi
 * rozetini temizlemek değildir.
 */

const MENTION_EXCERPT_LENGTH = 240;

/**
 * Karar K11: `Tümünü okundu işaretle` **yalnız bahsetmeleri** okur. Geri alma penceresi
 * 10 dakika; daha uzunu, kullanıcının çoktan unuttuğu bir eylemi geri alan bir düğme demek.
 */
export const MENTIONS_READ_ALL_UNDO_TTL_SECONDS = 10 * 60;

/**
 * Kitlesel çağrının takısı. `Message.mentionEveryone` `@everyone` ile `@here` arasında ayrım
 * tutmuyor (00-ortak-baglam §2.3), bu yüzden kart tek bir takı gösterir.
 *
 * Tel değeri dil bağımsızdır; kart bunu istemcide `mentions.badge.everyone` ile yerelleştirir.
 */
export const MENTION_EVERYONE_TAG = "@everyone";

/** `MentionStateSource` tel yazımı ile Prisma enum etiketi. */
const PRISMA_STATE_SOURCE = {
  channel: "CHANNEL",
  dm: "DM",
  everyone: "EVERYONE",
  thread: "THREAD",
} as const satisfies Record<MentionStateSource, string>;

// ---------------------------------------------------------------------------
// Bağımlılıklar
// ---------------------------------------------------------------------------

/**
 * 10 dakikalık geri alma kaydı. Arayüz enjekte ediliyor çünkü testin Redis'e ihtiyacı yok ve
 * bir zaman aşımını gerçek saatle beklemek testi yavaş değil, **kırılgan** yapar.
 */
export type MentionUndoStore = {
  read: (key: string) => Promise<string | null>;
  remove: (key: string) => Promise<unknown>;
  write: (key: string, value: string, ttlSeconds: number) => Promise<unknown>;
};

export const defaultMentionUndoStore: MentionUndoStore = {
  read: (key) => getRedisOp().get(key),
  remove: (key) => getRedisOp().del(key),
  write: (key, value, ttlSeconds) => getRedisOp().set(key, value, "EX", ttlSeconds),
};

export type MentionsDependencies = {
  readonly database: PrismaClient;
  readonly listVisibleChannels?: VisibleChannelResolver;
  readonly now?: () => Date;
  /** `null` = dağıtımın adresi bilinmiyor; kalıcı bağlantı göreli hâliyle verilir. */
  readonly origin?: URL | null;
  readonly undoStore?: MentionUndoStore;
};

export type MentionsListQuery = {
  readonly cursor?: string | undefined;
  readonly filter: MentionFilter;
  readonly limit: number;
  readonly query?: string | null | undefined;
  readonly source?: string | null | undefined;
  readonly window: MentionWindow;
};

// ---------------------------------------------------------------------------
// Metin
// ---------------------------------------------------------------------------

/** `buildMentionPreview` ile aynı belirteç: `@` + 2-32 karakter, kelime başında. */
const MENTION_TOKEN_PATTERN = /(^|[\s([{])@([a-zA-Z0-9_.-]{2,32})/gu;

function truncate(value: string): string {
  return value.length > MENTION_EXCERPT_LENGTH
    ? `${value.slice(0, MENTION_EXCERPT_LENGTH - 1).trimEnd()}…`
    : value;
}

/**
 * Gövde: takı çıkarılmış metin. Takı kartın başında ayrı bir çip olarak çiziliyor; metinde
 * ikinci kez durması aynı şeyi iki kere söylemek olurdu.
 */
export function toMentionBody(content: string): string {
  return truncate(content.replace(MENTION_TOKEN_PATTERN, "$1").replaceAll(/\s+/gu, " ").trim());
}

/** Metindeki ilk `@takı`, varsa. Thread kartının takısı buradan gelir. */
export function firstMentionToken(content: string): string | null {
  const match = /(?:^|[\s([{])@([a-zA-Z0-9_.-]{2,32})/u.exec(content);
  return match?.[1] ? `@${match[1]}` : null;
}

function excerpt(content: string): string {
  return truncate(content.replaceAll(/\s+/gu, " ").trim());
}

function firstInitial(name: string): string {
  return Array.from(toInitials(name))[0] ?? "?";
}

// ---------------------------------------------------------------------------
// Satır → kart
// ---------------------------------------------------------------------------

const KIND_BY_LABEL: Record<string, MentionKind> = {
  everyone: "everyone",
  me: "me",
  role: "role",
  thread: "thread",
};

type MentionMapperContext = {
  readonly conversationTitleById: ReadonlyMap<string, string>;
  readonly origin: URL | null;
  readonly threadByParentId: ReadonlyMap<string, ThreadReplyCountRow>;
  /** İzleyicinin kendi adı — `Bana özel` kartının takısı bu. */
  readonly viewerName: string;
};

/**
 * Karar K9: kullanıcı takısı gerçek `@username`den türer; ray alt metni onu gösterir. Kartın
 * takısı ise **gövdede vurgulanan metin**dir ve SPEC §10 onu `@Doğukan Yazar` olarak veriyor.
 * İki farklı yüzey: biri kimliği, diğeri vurgulanan metni gösterir.
 *
 * Thread kartında kimse adıyla çağrılmamış olabilir; o zaman metindeki ilk takı, o da yoksa
 * izleyicinin kendi adı kullanılır — kartın takısız kalması, kartın neden orada olduğunu
 * söylemeyen bir kart demekti.
 */
function resolveTag(row: MentionQueryRow, context: MentionMapperContext): string {
  switch (KIND_BY_LABEL[row.kind]) {
    case "role":
      // Rol silinmişse satır kalır ve bahsetme "rol" olmayı sürdürür; adı taşıyan kayıt
      // gittiğinde olan şey olmamış olmaz.
      return row.roleName ? `@${row.roleName}` : `@${context.viewerName}`;
    case "everyone":
      return MENTION_EVERYONE_TAG;
    case "thread":
      return firstMentionToken(row.content) ?? `@${context.viewerName}`;
    default:
      return `@${context.viewerName}`;
  }
}

function resolveSource(row: MentionQueryRow, context: MentionMapperContext): MentionSource {
  if (row.serverId && row.serverName) {
    return {
      channelId: row.channelId,
      channelName: row.channelName ?? "",
      serverId: row.serverId,
      serverInitial: firstInitial(row.serverName),
      serverName: row.serverName,
      type: "channel",
    };
  }

  return {
    conversationId: row.channelId,
    title: context.conversationTitleById.get(row.channelId) ?? row.conversationTitle ?? "",
    type: "dm",
  };
}

export function toMentionDto(row: MentionQueryRow, context: MentionMapperContext): Mention {
  const authorName = row.authorDisplayName ?? row.authorUsername;
  const href = buildMentionHref({
    channelId: row.channelId,
    messageId: row.messageId,
    serverId: row.serverId,
  });
  const thread = row.threadParentId ? context.threadByParentId.get(row.threadParentId) : undefined;

  return {
    author: {
      avatarUrl: row.authorAvatarUrl,
      handle: row.authorUsername,
      id: row.authorId,
      initials: toInitials(authorName),
      name: authorName,
    },
    body: toMentionBody(row.content),
    createdAt: row.occurredAt.toISOString(),
    href,
    id: row.mentionId,
    messageId: row.messageId,
    kind: KIND_BY_LABEL[row.kind] ?? "me",
    // Kalıcı bağlantı mutlak olmalı: kopyalanan bir adres başka bir sekmede, başka bir
    // uygulamada açılıyor. Dağıtımın adresi bilinmiyorsa göreli hâli hiç yoktan iyidir.
    permalink: context.origin ? new URL(href, context.origin).toString() : href,
    readLater: row.readLaterFirst,
    source: resolveSource(row, context),
    stateKey: { refId: row.refId, source: row.stateSource },
    tag: resolveTag(row, context),
    unread: row.unread,
    ...(row.quoteText
      ? { quote: { authorName: row.quoteAuthorName ?? "", text: excerpt(row.quoteText) } }
      : {}),
    ...(row.threadParentId
      ? {
          thread: {
            id: row.threadParentId,
            open: thread?.open ?? true,
            replyCount: thread?.replyCount ?? 0,
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Ortak kapsam
// ---------------------------------------------------------------------------

type ScopeInput = {
  readonly filter: MentionFilter;
  readonly includeDismissed?: boolean;
  readonly query?: string | null | undefined;
  readonly source?: string | null | undefined;
  readonly window: MentionWindow;
};

async function resolveScope(
  userId: string,
  dependencies: MentionsDependencies,
  input: ScopeInput,
): Promise<MentionQueryScope> {
  const { textChannelIds } = await resolveHomeChannelAccess(
    dependencies.database,
    userId,
    dependencies.listVisibleChannels ?? defaultVisibleChannelResolver,
  );

  return {
    channelIds: textChannelIds,
    filter: input.filter,
    includeDismissed: input.includeDismissed ?? false,
    now: dependencies.now?.() ?? new Date(),
    query: input.query ?? null,
    source: input.source ?? null,
    userId,
    window: input.window,
  };
}

function resolveOrigin(dependencies: MentionsDependencies): URL | null {
  return dependencies.origin === undefined ? resolveAppOrigin() : dependencies.origin;
}

async function readViewer(database: PrismaClient, userId: string) {
  const viewer = await database.user.findUnique({
    select: { displayName: true, locale: true, username: true },
    where: { id: userId },
  });

  return {
    locale: normalizeAppLocale(viewer?.locale),
    name: viewer?.displayName ?? viewer?.username ?? "",
  };
}

async function readGroupConversationTitles(
  database: PrismaClient,
  userId: string,
  rows: readonly MentionQueryRow[],
  locale: "en" | "tr",
): Promise<Map<string, string>> {
  const conversationIds = [
    ...new Set(rows.filter((row) => row.stateSource === "dm").map((row) => row.channelId)),
  ];
  if (conversationIds.length === 0) {
    return new Map();
  }

  const conversations = await database.dMConversation.findMany({
    where: { id: { in: conversationIds }, type: "GROUP_DM" },
    select: {
      id: true,
      name: true,
      participants: {
        orderBy: { joinedAt: "asc" },
        select: {
          userId: true,
          user: { select: { displayName: true, username: true } },
        },
      },
    },
  });

  return new Map(
    conversations.map((conversation) => [
      conversation.id,
      getGroupConversationTitle(
        {
          name: conversation.name,
          participants: conversation.participants.map((participant) => ({
            displayName: participant.user.displayName,
            userId: participant.userId,
            username: participant.user.username,
          })),
        },
        userId,
        "",
        locale,
      ),
    ]),
  );
}

async function readThreadCounts(
  database: PrismaClient,
  rows: readonly MentionQueryRow[],
): Promise<Map<string, ThreadReplyCountRow>> {
  const parentIds = [
    ...new Set(rows.map((row) => row.threadParentId).filter((id): id is string => Boolean(id))),
  ];
  const query = buildThreadReplyCountQuery(parentIds);
  if (!query) {
    return new Map();
  }

  const counts = await database.$queryRaw<ThreadReplyCountRow[]>(query);
  return new Map(counts.map((count) => [count.parentId, count]));
}

async function buildMapperContext(
  dependencies: MentionsDependencies,
  userId: string,
  rows: readonly MentionQueryRow[],
): Promise<MentionMapperContext> {
  const viewer = await readViewer(dependencies.database, userId);
  const [conversationTitleById, threadByParentId] = await Promise.all([
    readGroupConversationTitles(dependencies.database, userId, rows, viewer.locale),
    readThreadCounts(dependencies.database, rows),
  ]);

  return {
    conversationTitleById,
    origin: resolveOrigin(dependencies),
    threadByParentId,
    viewerName: viewer.name,
  };
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export async function listMentions(
  userId: string,
  query: MentionsListQuery,
  dependencies: MentionsDependencies,
): Promise<MentionListResponse> {
  const scope = await resolveScope(userId, dependencies, query);
  const cursor = decodeMentionCursor(query.cursor);
  const pageQuery = buildMentionPageQuery(scope, cursor, query.limit);
  const totalQuery = buildMentionTotalQuery(scope);

  const readSourceTitle = async (): Promise<string | null> => {
    if (!scope.source || scope.source === "dm" || scope.channelIds.length === 0) {
      return null;
    }

    const channel = await dependencies.database.channel.findFirst({
      where: { id: { in: [...scope.channelIds] }, serverId: scope.source },
      select: { server: { select: { name: true } } },
    });
    return channel?.server?.name ?? null;
  };

  if (!pageQuery || !totalQuery) {
    return { items: [], nextCursor: null, sourceTitle: await readSourceTitle(), total: 0 };
  }

  const rows = await dependencies.database.$queryRaw<MentionQueryRow[]>(pageQuery);
  const totalRows = await dependencies.database.$queryRaw<Array<{ total: number }>>(totalQuery);
  const sourceTitle = await readSourceTitle();
  const page = rows.slice(0, query.limit);
  const context = await buildMapperContext(dependencies, userId, page);
  const last = page.at(-1);

  return {
    items: page.map((row) => toMentionDto(row, context)),
    nextCursor:
      rows.length > query.limit && last
        ? encodeMentionCursor({
            id: last.mentionId,
            occurredAt: last.occurredAt,
            readLaterFirst: last.readLaterFirst,
          })
        : null,
    sourceTitle,
    total: totalRows[0]?.total ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Sayaçlar
// ---------------------------------------------------------------------------

function toCounts(row: MentionCountsRow, roleNames: readonly string[] = []): MentionCounts {
  return {
    all: row.all,
    bySource: row.bySource ?? {},
    everyone: row.everyone,
    me: row.me,
    readLater: row.readLater,
    role: row.role,
    roleNames: [...roleNames],
    thread: row.thread,
    unread: row.unread,
  };
}

/**
 * Karar K4: `unreadMentions` artık **buradan** okunur. `ChannelReadState.mentionCount` ve
 * `DMParticipant.mentionCount` silinmez — kanal ve DM satırlarındaki rozetler onları okumaya
 * devam eder; kesilen tek bağ `app/summary`nin bağı.
 *
 * Pencere çağırana ait: gezinme paneli rozeti `all` sayar (30 günden eski bir okunmamış
 * bahsetme hâlâ okunmamıştır), ekranın sayaçları ise gösterdiği pencereyi sayar.
 */
export async function countMentions(
  userId: string,
  input: { readonly window: MentionWindow },
  dependencies: MentionsDependencies,
): Promise<MentionCounts> {
  const scope = await resolveScope(userId, dependencies, { filter: "all", window: input.window });
  const [counts, memberships] = await Promise.all([
    countMentionsInScope(dependencies.database, scope),
    dependencies.database.serverMember.findMany({
      where: { userId },
      select: {
        roles: {
          where: { role: { mentionable: true } },
          select: { role: { select: { name: true } } },
        },
      },
    }),
  ]);
  const roleNames = [
    ...new Set(memberships.flatMap((membership) => membership.roles.map(({ role }) => role.name))),
  ].sort((left, right) => left.localeCompare(right));

  return { ...counts, roleNames };
}

/**
 * Kanal erişimi **zaten çözülmüşken** sayan hâli. `app/summary` görünür kanal listesini
 * kendi ilk adımında çıkarıyor; aynı çözümlemeyi ikinci kez yapmak, tek sayı için iki kat
 * izin sorgusu demekti.
 */
export async function countMentionsInScope(
  database: PrismaClient,
  scope: MentionQueryScope,
): Promise<MentionCounts> {
  const query = buildMentionCountsQuery(scope);
  if (!query) {
    return toCounts(EMPTY_MENTION_COUNTS_ROW);
  }

  const rows = await database.$queryRaw<MentionCountsRow[]>(query);
  return toCounts(rows[0] ?? EMPTY_MENTION_COUNTS_ROW);
}

/**
 * Gezinme panelinin rozeti. `window: "all"` — 30 günden eski bir okunmamış bahsetme hâlâ
 * okunmamıştır ve rozet bir pencere değil, bir borç gösterir.
 */
export function buildUnreadMentionScope(
  userId: string,
  channelIds: readonly string[],
  now: Date,
): MentionQueryScope {
  return {
    channelIds,
    filter: "all",
    includeDismissed: false,
    now,
    query: null,
    source: null,
    userId,
    window: "all",
  };
}

// ---------------------------------------------------------------------------
// Tek bahsetme
// ---------------------------------------------------------------------------

/**
 * Satırın kendisi — DTO'ya çevrilmeden. `messageId` ve `channelId` gibi alanlar yazma
 * yolunda gerekiyor ve onları karttan geri çıkarmak (adres çözümlemek) bir yolu iki kez
 * anlatmak olurdu.
 */
async function readMentionRow(
  userId: string,
  key: MentionStateKey,
  dependencies: MentionsDependencies,
): Promise<MentionQueryRow> {
  const scope = await resolveScope(userId, dependencies, {
    filter: "all",
    includeDismissed: true,
    window: "all",
  });
  const query = buildMentionByKeyQuery(scope, key);
  const rows = query ? await dependencies.database.$queryRaw<MentionQueryRow[]>(query) : [];
  const row = rows[0];

  if (!row) {
    // Görünürlük sorgunun süzgeci: erişimi olmayan bir kimlik "yasak" değil, **yok**.
    throw new ApiError("Mention not found", 404);
  }

  return row;
}

export async function getMention(
  userId: string,
  key: MentionStateKey,
  dependencies: MentionsDependencies,
): Promise<Mention> {
  const row = await readMentionRow(userId, key, dependencies);
  return toMentionDto(row, await buildMapperContext(dependencies, userId, [row]));
}

// ---------------------------------------------------------------------------
// Bağlam paneli
// ---------------------------------------------------------------------------

const CONTEXT_NEIGHBOUR_COUNT = 2;

type ContextAuthor = { avatarUrl: string | null; displayName: string | null; username: string };
type ContextRow = {
  author: ContextAuthor | null;
  content: string;
  createdAt: Date;
  id: string;
};

const CONTEXT_AUTHOR_SELECT = {
  select: { avatarUrl: true, displayName: true, username: true },
} as const;

function toContextMessage(row: ContextRow, anchorId: string): MentionContextMessage {
  const name = row.author?.displayName ?? row.author?.username ?? "";

  return {
    authorName: name,
    avatarUrl: row.author?.avatarUrl ?? null,
    id: row.id,
    initials: toInitials(name),
    isMention: row.id === anchorId,
    text: excerpt(row.content),
    time: row.createdAt.toISOString(),
  };
}

/**
 * SPEC §6 — bahsetmenin **±2** mesajı, bahsetmenin kendisi ortada.
 *
 * Kapsam bahsetmenin kendi kanalı/konuşması; o kanala erişim `readMentionRow` çağrısında
 * sorgunun süzgeci olarak zaten uygulandı, yani buradaki okuma yetkilendirilmiş bir kapsamın
 * içinde kalır.
 */
export async function getMentionContext(
  userId: string,
  key: MentionStateKey,
  dependencies: MentionsDependencies,
): Promise<MentionContext> {
  const row = await readMentionRow(userId, key, dependencies);
  const { database } = dependencies;
  const anchorAt = row.occurredAt;
  const isDm = !row.serverId;

  const [before, anchor, after] = await Promise.all([
    isDm
      ? database.dMMessage.findMany({
          include: { author: CONTEXT_AUTHOR_SELECT },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: CONTEXT_NEIGHBOUR_COUNT,
          where: {
            conversationId: row.channelId,
            createdAt: { lt: anchorAt },
            deletedAt: null,
          },
        })
      : database.message.findMany({
          include: { author: CONTEXT_AUTHOR_SELECT },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: CONTEXT_NEIGHBOUR_COUNT,
          where: { channelId: row.channelId, createdAt: { lt: anchorAt }, deletedAt: null },
        }),
    isDm
      ? database.dMMessage.findMany({
          include: { author: CONTEXT_AUTHOR_SELECT },
          take: 1,
          where: { conversationId: row.channelId, id: row.messageId },
        })
      : database.message.findMany({
          include: { author: CONTEXT_AUTHOR_SELECT },
          take: 1,
          where: { channelId: row.channelId, id: row.messageId },
        }),
    isDm
      ? database.dMMessage.findMany({
          include: { author: CONTEXT_AUTHOR_SELECT },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: CONTEXT_NEIGHBOUR_COUNT,
          where: {
            conversationId: row.channelId,
            createdAt: { gt: anchorAt },
            deletedAt: null,
          },
        })
      : database.message.findMany({
          include: { author: CONTEXT_AUTHOR_SELECT },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: CONTEXT_NEIGHBOUR_COUNT,
          where: { channelId: row.channelId, createdAt: { gt: anchorAt }, deletedAt: null },
        }),
  ]);

  const ordered = [...(before as ContextRow[])]
    .reverse()
    .concat(anchor as ContextRow[], after as ContextRow[]);

  return { messages: ordered.map((message) => toContextMessage(message, row.messageId)) };
}

// ---------------------------------------------------------------------------
// Durum yazımı
// ---------------------------------------------------------------------------

export type MentionStatePatch = {
  readonly dismissed?: boolean | undefined;
  readonly read?: boolean | undefined;
  readonly readLater?: boolean | undefined;
};

function stateWhere(userId: string, source: MentionStateSource, refId: string) {
  return {
    userId_source_refId: { refId, source: PRISMA_STATE_SOURCE[source], userId },
  };
}

/**
 * `MentionState.refId` kanal ve DM dallarında **bahsetme satırının** kimliği, bildirimin
 * `dedupeKey`i ise **mesaj** kimliğiyle kuruluyor. İkisi aynı şey değil; anahtar bu yüzden
 * satırın mesaj kimliğinden üretilir.
 */
function mentionDedupeKey(source: MentionStateSource, messageId: string, userId: string): string {
  return `${MENTION_DEDUPE_PREFIX[source]}${messageId}:${userId}`;
}

export async function updateMentionState(
  userId: string,
  key: MentionStateKey,
  patch: MentionStatePatch,
  dependencies: MentionsDependencies,
): Promise<Mention> {
  const { database } = dependencies;
  const now = dependencies.now?.() ?? new Date();

  // Yazmadan önce oku: erişimi olmayan bir bahsetmenin durumunu yazmak, olmayan bir satırın
  // kimliğini kalıcı hâle getirmek olurdu.
  const row = await readMentionRow(userId, key, dependencies);

  const data: { dismissedAt?: Date | null; readAt?: Date | null; readLaterAt?: Date | null } = {};

  if (patch.read !== undefined) {
    data.readAt = patch.read ? now : null;
  }

  if (patch.readLater !== undefined) {
    // K5: `Sonra oku` kartı okunmamış bırakır ve üstte sabitler. Okundu bayrağına dokunmaz.
    data.readLaterAt = patch.readLater ? now : null;
  }

  if (patch.dismissed !== undefined) {
    data.dismissedAt = patch.dismissed ? now : null;
  }

  await database.mentionState.upsert({
    create: {
      dismissedAt: data.dismissedAt ?? null,
      readAt: data.readAt ?? null,
      readLaterAt: data.readLaterAt ?? null,
      refId: key.refId,
      source: PRISMA_STATE_SOURCE[key.source],
      userId,
    },
    update: data,
    where: stateWhere(userId, key.source, key.refId),
  });

  if (patch.read !== undefined) {
    await database.notification.updateMany({
      data: { read: patch.read, readAt: patch.read ? now : null },
      where: { dedupeKey: mentionDedupeKey(key.source, row.messageId, userId), userId },
    });
  }

  return getMention(userId, key, dependencies);
}

// ---------------------------------------------------------------------------
// Tümünü okundu işaretle + geri al
// ---------------------------------------------------------------------------

export type MentionReadAllResult = {
  readonly affected: number;
  readonly undoToken: string;
};

export type MentionUndoResult = {
  readonly restored: number;
};

type MentionUndoRecord = {
  readonly keys: ReadonlyArray<{ readonly refId: string; readonly source: MentionStateSource }>;
  readonly notificationIds: readonly string[];
};

function undoKey(userId: string, token: string): string {
  return `mentions:read-all-undo:${userId}:${token}`;
}

/**
 * Karar K11. `notifications/service.ts: markAllRead` bu ekranda **kullanılmaz**: o fonksiyon
 * kullanıcının bütün okunmamış bildirimlerini okur — arkadaşlık isteği, sistem duyurusu,
 * rozet. Buradaki yazım sorgunun döndürdüğü **bildirim kimlikleriyle** sınırlı; kimlik listesi
 * bahsetme sorgusundan geldiği için başka bir bildirim türüne dokunması mümkün değil.
 *
 * Pencere yok: "tümü" 30 günle sınırlıysa tümü değildir.
 */
export async function markAllMentionsRead(
  userId: string,
  dependencies: MentionsDependencies,
): Promise<MentionReadAllResult> {
  const { database } = dependencies;
  const now = dependencies.now?.() ?? new Date();
  const scope = await resolveScope(userId, dependencies, { filter: "unread", window: "all" });
  const query = buildUnreadMentionKeysQuery(scope);
  const rows = query ? await database.$queryRaw<UnreadMentionKeyRow[]>(query) : [];

  if (rows.length === 0) {
    return { affected: 0, undoToken: "" };
  }

  for (const row of rows) {
    await database.mentionState.upsert({
      create: {
        readAt: now,
        refId: row.refId,
        source: PRISMA_STATE_SOURCE[row.stateSource],
        userId,
      },
      update: { readAt: now },
      where: stateWhere(userId, row.stateSource, row.refId),
    });
  }

  const notificationIds = rows
    .map((row) => row.notificationId)
    .filter((id): id is string => Boolean(id));

  if (notificationIds.length > 0) {
    await database.notification.updateMany({
      data: { read: true, readAt: now },
      where: { id: { in: notificationIds }, userId },
    });
  }

  const token = randomUUID();
  const record: MentionUndoRecord = {
    keys: rows.map((row) => ({ refId: row.refId, source: row.stateSource })),
    notificationIds,
  };

  await (dependencies.undoStore ?? defaultMentionUndoStore).write(
    undoKey(userId, token),
    JSON.stringify(record),
    MENTIONS_READ_ALL_UNDO_TTL_SECONDS,
  );

  return { affected: rows.length, undoToken: token };
}

export async function undoMarkAllMentionsRead(
  userId: string,
  token: string,
  dependencies: MentionsDependencies,
): Promise<MentionUndoResult> {
  const store = dependencies.undoStore ?? defaultMentionUndoStore;
  const raw = await store.read(undoKey(userId, token));

  if (!raw) {
    // Kayıt süresi dolmuş ya da hiç olmamış. 410 "vardı, artık yok" demek; istemci bunu bir
    // hata değil, kapanmış bir pencere olarak gösterir.
    throw new ApiError("Undo window has expired", 410, "MENTION_UNDO_EXPIRED");
  }

  const record = JSON.parse(raw) as MentionUndoRecord;
  const { database } = dependencies;

  for (const key of record.keys) {
    await database.mentionState.updateMany({
      data: { readAt: null },
      where: { refId: key.refId, source: PRISMA_STATE_SOURCE[key.source], userId },
    });
  }

  if (record.notificationIds.length > 0) {
    await database.notification.updateMany({
      data: { read: false, readAt: null },
      where: { id: { in: [...record.notificationIds] }, userId },
    });
  }

  await store.remove(undoKey(userId, token));

  return { restored: record.keys.length };
}
