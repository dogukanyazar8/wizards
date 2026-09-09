import { randomUUID } from "node:crypto";
import {
  buildGroupAvatarPair,
  GROUP_MEMBER_NAME_COLORS,
  GROUP_PINNED_EXCERPT_MAX_LENGTH,
  isMuteActive,
  MESSAGE_CONTENT_DEFAULT_LIMIT,
  normalizeServerIconTone,
  pickNextMemberNameColor,
  resolveMutedUntil,
  type DMConversationDTO,
  type DMConversationType,
  type DMMessagePayload,
  type DMNotifyLevel,
  type DMPinnedMessageDTO,
  type DMSystemMessageTypeValue,
  type DMParticipantDTO,
  type MessageReaction,
  type MessageThreadSummary,
  type SetMutedRequest,
} from "@wizards/types";
import { Prisma, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { buildGroupReadReceipt } from "@/lib/dm/group-presentation";
import { POLL_SELECT, mapPollToDTO, type RawPoll } from "@/lib/polls/presentation";
import { areFriends, getBlockStatus, haveMutualServers } from "@/lib/friends/helpers";
import { resolveLastSeenAtByUserId } from "@/lib/friends/last-seen";
import { getRedis } from "@/lib/redis";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { mapAttachmentsForViewer } from "@/lib/messages/attachment-visibility";
import { readPresenceState, type PresenceFields } from "@/lib/presence";
import { getSocketServer } from "@/lib/socket/runtime";
import {
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
} from "@/lib/privacy/visibility-policy";
import { canStartDirectMessage } from "@/lib/privacy-policy";
import type {
  DMConversationsPageResponse,
  DMMessagesResponse,
  DMMutualServerSummary,
} from "./types";

export const dmAuthorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  status: true,
  customStatus: true,
} as const;

const dmParticipantUserSelect = {
  ...dmAuthorSelect,
  customStatus: true,
} as const;

export const dmNotificationUserSelect = {
  ...dmAuthorSelect,
  locale: true,
} as const;

export const dmAttachmentSelect = {
  id: true,
  userId: true,
  url: true,
  filename: true,
  contentType: true,
  size: true,
  width: true,
  height: true,
  duration: true,
  waveform: true,
  thumbnailUrl: true,
  scanStatus: true,
} as const;

const dmReplyInclude = {
  author: { select: dmAuthorSelect },
  attachments: { select: dmAttachmentSelect },
  reply: {
    include: {
      author: { select: dmAuthorSelect },
      attachments: { select: dmAttachmentSelect },
    },
  },
} as const;

export const dmMessageInclude = {
  author: { select: dmAuthorSelect },
  attachments: { select: dmAttachmentSelect },
  reply: { include: dmReplyInclude },
  /**
   * Mesajlar karar #1. A to-one relation, so a page of messages costs one extra
   * statement rather than one per row, and only poll messages carry any rows.
   */
  poll: { select: POLL_SELECT },
} as const;

/**
 * Bir satırın çizmesi için gereken en çok katılımcı.
 *
 * Satır iki tile ve iki sayaç çiziyor; tile'lar görüntüleyeni **dışlayarak**
 * seçiliyor (`buildGroupAvatarPair`), o yüzden ilk sekiz kayıt her durumda
 * yeter. Sınır olmadan 250 üyeli bir grup, hiç çizilmeyecek 250 katılımcı
 * satırını (her biri kullanıcı kaydıyla birlikte) her liste sayfasında
 * getiriyordu.
 */
export const DM_ROW_PARTICIPANT_TAKE = 8;

export const dmConversationInclude = {
  /**
   * Kesin üye sayısı. `participants.length` okumak, katılımcı listesi
   * sınırlandığı anda **yalan** söylerdi; sayım veritabanında yapılıyor.
   */
  _count: { select: { participants: true } },
  participants: {
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      unreadCount: true,
      // F2 / 2a §5. Already a column; the web list badge is the reader that was
      // missing, and reading it here costs the same query.
      mentionCount: true,
      muted: true,
      // §17 / karar K8. Read beside `muted` because every reader of the flag has
      // to know whether the mute has run out; a reader that sees only `muted`
      // keeps a 15-minute mute on forever.
      mutedUntil: true,
      hiddenAt: true,
      // Faz 1 §B3. Five scalars per row rather than a second `members` array:
      // the array would repeat the presence and last-seen this row already has.
      historyFromAt: true,
      joinedAt: true,
      nameColor: true,
      notifyLevel: true,
      pinnedAt: true,
      pinnedStripDismissedId: true,
      role: true,
      user: { select: dmParticipantUserSelect },
    },
  },
  // A to-one relation, so this is one extra statement for a whole page of
  // conversations rather than one per row. 2d §2's strip and 2e §4's card both
  // read it, and both are reached from a conversation the client already has.
  pinnedMessage: {
    select: {
      author: { select: { displayName: true, username: true } },
      content: true,
      deletedAt: true,
      id: true,
    },
  },
  messages: {
    where: { placeholderRemovedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
    include: dmMessageInclude,
  },
} as const;

/**
 * Liste yolunun include'u: aynı şekil, **sınırlı** katılımcı okuması.
 *
 * Tek bir konuşma açılırken tam roster gerekiyor (üye listesi, roller, çevrimiçi
 * sayacı); elli konuşmalık bir liste sayfasında gerekmiyor ve orada bedeli
 * konuşma başına üye sayısı kadar satır + o kadar presence sorgusu.
 */
export const dmConversationRowInclude = {
  ...dmConversationInclude,
  participants: {
    ...dmConversationInclude.participants,
    take: DM_ROW_PARTICIPANT_TAKE,
  },
} as const;

type DMMessageNode = {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  replyToId: string | null;
  threadParentId: string | null;
  /**
   * Mesajlar §6.1. Ana sohbete de gönderilmiş bir thread yanıtı. İsteğe bağlı:
   * elle kurulmuş eski fikstürler kolonu tanımıyor ve sıradan bir mesaj okunur.
   */
  alsoSentToChannel?: boolean;
  forwardedAt: Date | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedById: string | null;
  placeholderRemovedAt: Date | null;
  createdAt: Date;
  /**
   * Faz 5 §16.1. Optional on the node because a reply preview is selected with
   * the same include but older callers hand-build nodes in tests; a row that
   * predates the columns reads as an ordinary message.
   */
  systemType?: DMSystemMessageTypeValue | null;
  systemTargetUserIds?: string[];
  systemValue?: string | null;
  /**
   * K3 / Faz 2 §C4. Optional for the same reason: a hand-built node in a test,
   * or a reply preview selected before the column existed, reads as permanent.
   */
  expiresAt?: Date | null;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
    customStatus: string | null;
  };
  attachments: Array<{
    id: string;
    userId: string;
    url: string;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
    duration: number | null;
    thumbnailUrl: string | null;
    scanStatus: "PENDING" | "CLEAN" | "INFECTED" | "ERROR";
  }>;
  reactions?: Array<{
    emoji: string;
    userId: string;
  }>;
  reply?: DMMessageNode | null;
  /**
   * Mesajlar karar #1. Optional for the same reason `reply` is: hand-built test
   * nodes and reply previews do not select it, and a message without a poll is
   * every message but a handful.
   */
  poll?: RawPoll | null;
};

type RawDMMessage = Prisma.DMMessageGetPayload<{
  include: typeof dmMessageInclude;
}>;

/**
 * Exported so a writer that already loaded this projection inside its own
 * transaction can hand it straight to `mapDMConversationDTO` instead of making
 * the caller re-read the row it just wrote.
 */
export type RawDMConversation = Prisma.DMConversationGetPayload<{
  include: typeof dmConversationInclude;
}>;

type DMReactionRow = {
  avatarUrl: string | null;
  createdAt: Date | null;
  displayName: string | null;
  emoji: string;
  messageId: string;
  userId: string;
  username: string;
};

type DMConversationPageRow = {
  conversationId: string;
  participantId: string;
};

type DMThreadSummaryRow = {
  lastReplyAt: Date | null;
  replyCount: number;
  threadParentId: string;
};

function getPresenceFallback(
  participant: RawDMConversation["participants"][number],
): PresenceFields {
  return {
    status: "OFFLINE",
    customStatus: participant.user.customStatus,
  };
}

async function readDMConversationPresenceState(conversation: RawDMConversation, viewerId: string) {
  const subjectIds = conversation.participants.map((participant) => participant.userId);
  const [presenceState, visibilityDecisions] = await Promise.all([
    readPresenceState(
      getRedis(),
      conversation.participants.map((participant) => ({
        ...getPresenceFallback(participant),
        userId: participant.userId,
      })),
    ),
    resolveVisibilityDecisions(viewerId, subjectIds),
  ]);

  return redactPresenceCollectionForViewer({
    decisions: visibilityDecisions,
    invisibleUserIds: presenceState.hiddenUserIds,
    lastSeenByUserId: new Map(),
    presenceByUserId: presenceState.presenceByUserId,
    subjectIds,
  });
}

/**
 * The chat header's "Son görülme" line. Redis presence only says online/offline
 * right now, so an offline partner needs the same `AppSession.lastSeenAt` the
 * friends list reads — the header used to print `lastMessageAt` instead, which
 * moves whenever *either* side sends and therefore described the conversation,
 * not the partner.
 */
async function readDMConversationLastSeenMap(conversation: RawDMConversation) {
  return resolveLastSeenAtByUserId(
    conversation.participants.map((participant) => participant.userId),
  );
}

function normalizeConversationType(type: string): DMConversationDTO["type"] {
  return type === "GROUP_DM" ? "GROUP_DM" : "DM";
}

function validateDMReactionEmoji(emoji: string) {
  const trimmed = emoji.trim();
  if (!trimmed || trimmed.length > 64) {
    throw new ApiError("Invalid emoji", 400, "INVALID_EMOJI");
  }

  return trimmed;
}

function groupDMReactions(
  reactions: Array<{
    avatarUrl?: string | null;
    createdAt?: Date | null;
    displayName?: string | null;
    emoji: string;
    userId: string;
    username?: string;
  }> = [],
): MessageReaction[] {
  const grouped = new Map<
    string,
    {
      userIds: Set<string>;
      users: Map<
        string,
        {
          id: string;
          username: string;
          displayName: string | null;
          avatarUrl: string | null;
          reactedAt?: string;
        }
      >;
    }
  >();

  for (const reaction of reactions) {
    if (!grouped.has(reaction.emoji)) {
      grouped.set(reaction.emoji, { userIds: new Set(), users: new Map() });
    }

    const entry = grouped.get(reaction.emoji)!;
    entry.userIds.add(reaction.userId);
    entry.users.set(reaction.userId, {
      id: reaction.userId,
      username: reaction.username ?? reaction.userId,
      displayName: reaction.displayName ?? null,
      avatarUrl: reaction.avatarUrl ?? null,
      ...(reaction.createdAt ? { reactedAt: reaction.createdAt.toISOString() } : {}),
    });
  }

  return Array.from(grouped.entries()).map(([emoji, entry]) => ({
    emoji,
    count: entry.userIds.size,
    userIds: Array.from(entry.userIds),
    users: Array.from(entry.users.values()),
  }));
}

function createEmptyThreadSummary(): MessageThreadSummary {
  return {
    replyCount: 0,
    lastReplyAt: null,
    recentRepliers: [],
  };
}

async function getDMThreadSummaryMap(parentMessageIds: string[]) {
  if (parentMessageIds.length === 0) {
    return new Map<string, MessageThreadSummary>();
  }

  const counts = await prisma.$queryRaw<DMThreadSummaryRow[]>(Prisma.sql`
    SELECT
      "threadParentId",
      COUNT(*)::int AS "replyCount",
      MAX("createdAt") AS "lastReplyAt"
      FROM "DMMessage"
      WHERE "threadParentId" IN (${Prisma.join(parentMessageIds)})
        AND "deletedAt" IS NULL
        AND "placeholderRemovedAt" IS NULL
      GROUP BY "threadParentId"
    `);

  const latestReplies = await prisma.dMMessage.findMany({
    where: {
      threadParentId: { in: parentMessageIds },
      deletedAt: null,
      placeholderRemovedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(parentMessageIds.length * 4, 200),
    select: {
      threadParentId: true,
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const summaries = new Map<string, MessageThreadSummary>();
  for (const row of counts) {
    if (!row.threadParentId) {
      continue;
    }

    summaries.set(row.threadParentId, {
      replyCount: row.replyCount,
      lastReplyAt: row.lastReplyAt?.toISOString() ?? null,
      recentRepliers: [],
    });
  }

  for (const reply of latestReplies) {
    if (!reply.threadParentId) {
      continue;
    }

    const summary = summaries.get(reply.threadParentId);
    if (!summary || summary.recentRepliers.some((user) => user.userId === reply.author.id)) {
      continue;
    }

    if (summary.recentRepliers.length < 3) {
      summary.recentRepliers.push({
        userId: reply.author.id,
        username: reply.author.username,
        displayName: reply.author.displayName,
        avatarUrl: reply.author.avatarUrl,
      });
    }
  }

  return summaries;
}

async function getDMReactionMap(messageIds: string[]) {
  if (messageIds.length === 0) {
    return new Map<string, DMReactionRow[]>();
  }

  const rows = await prisma.$queryRaw<DMReactionRow[]>(Prisma.sql`
    SELECT
      r."messageId",
      r."emoji",
      r."userId",
      r."createdAt",
      u."username",
      u."displayName",
      u."avatarUrl"
    FROM "DMReaction" r
    INNER JOIN "User" u ON u."id" = r."userId"
    WHERE r."messageId" IN (${Prisma.join(messageIds)})
  `);
  const reactionsByMessageId = new Map<string, DMReactionRow[]>();

  for (const row of rows) {
    const current = reactionsByMessageId.get(row.messageId) ?? [];
    current.push(row);
    reactionsByMessageId.set(row.messageId, current);
  }

  return reactionsByMessageId;
}

export function getDMDisplayName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username;
}

export function mapDMParticipantWithPresence(
  participant: RawDMConversation["participants"][number],
  presence: PresenceFields,
  lastSeenAt: string | null,
  viewerId: string,
  now: Date = new Date(),
): DMParticipantDTO {
  const isViewer = participant.userId === viewerId;

  return {
    userId: participant.userId,
    username: participant.user.username,
    displayName: participant.user.displayName,
    avatarUrl: participant.user.avatarUrl,
    // These are inbox preferences, not roster metadata. Copying every row's
    // values exposed who muted the group and how much they had not read.
    unreadCount: isViewer ? participant.unreadCount : 0,
    mentionCount: isViewer ? participant.mentionCount : 0,
    // Karar K8: the stored flag is not the answer, the deadline is. An expired
    // `mutedUntil` reads as unmuted here — which is what lets the rail and the
    // profile panel be right without a scheduled sweep ever running.
    muted: isViewer ? isMuteActive(participant, now) : false,
    lastSeenAt,
    status: presence.status,
    customStatus: presence.customStatus,
    presence,
    joinedAt: participant.joinedAt.toISOString(),
    nameColor: participant.nameColor,
    role: participant.role,
  };
}

/**
 * 2d §2 / 2e §4. A soft-deleted pin reads as no pin: the row survives for the
 * message list's "silinmiş mesaj" placeholder, but quoting it in the strip would
 * put deleted content back on screen.
 */
function mapPinnedMessage(
  conversation: RawDMConversation,
  viewer: RawDMConversation["participants"][number] | undefined,
): DMPinnedMessageDTO | null {
  const pinned = conversation.pinnedMessage;

  if (!pinned || pinned.deletedAt !== null) {
    return null;
  }

  const excerpt = pinned.content.replace(/\s+/g, " ").trim();

  return {
    authorName: pinned.author.displayName ?? pinned.author.username,
    dismissed: viewer?.pinnedStripDismissedId === pinned.id,
    excerpt:
      excerpt.length > GROUP_PINNED_EXCERPT_MAX_LENGTH
        ? `${excerpt.slice(0, GROUP_PINNED_EXCERPT_MAX_LENGTH)}…`
        : excerpt,
    id: pinned.id,
  };
}

function mapDMReply(
  message: DMMessageNode | null | undefined,
  depth: number,
  reactionsByMessageId: Map<string, DMReactionRow[]> = new Map(),
  threadSummaryByMessageId: Map<string, MessageThreadSummary> = new Map(),
  viewerId?: string | null,
): DMMessagePayload | null {
  if (!message) {
    return null;
  }

  const nextReply =
    depth > 0
      ? mapDMReply(
          message.reply ?? null,
          depth - 1,
          reactionsByMessageId,
          threadSummaryByMessageId,
          viewerId,
        )
      : null;

  return {
    id: message.id,
    conversationId: message.conversationId,
    userId: message.userId,
    content: message.deletedAt ? "" : message.content,
    replyToId: message.replyToId,
    threadParentId: message.threadParentId,
    alsoSentToChannel: message.alsoSentToChannel ?? false,
    threadSummary: threadSummaryByMessageId.get(message.id) ?? createEmptyThreadSummary(),
    forwardedAt: message.forwardedAt?.toISOString() ?? null,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    deletedById: message.deletedById,
    createdAt: message.createdAt.toISOString(),
    author: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName,
      avatarUrl: message.author.avatarUrl,
      // Presence is viewer-specific. Conversation participant payloads are
      // already policy-filtered; duplicating raw author presence on every
      // message would bypass that boundary for FRIENDS/NOBODY and INVISIBLE.
      status: "OFFLINE",
      customStatus: null,
    },
    attachments: mapAttachmentsForViewer(message.attachments, viewerId).map((attachment) => ({
      ...attachment,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      duration: attachment.duration ?? null,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
    })),
    reactions: groupDMReactions(reactionsByMessageId.get(message.id) ?? message.reactions ?? []),
    replyTo: nextReply,
    // `mapPollToDTO` is the single mapper: the message payload, `GET /v1/polls`
    // and the socket broadcast all read `canSeeVoters` from the same line.
    poll: message.poll ? mapPollToDTO(message.poll, viewerId) : null,
    systemType: message.systemType ?? null,
    systemTargetUserIds: message.systemTargetUserIds ?? [],
    systemValue: message.systemValue ?? null,
    // C4. Lets the client count a bubble down instead of waiting for the sweep's
    // event, which can be up to a minute behind the deadline.
    expiresAt: message.expiresAt?.toISOString() ?? null,
  };
}

export function mapDMMessagePayload(
  message: RawDMMessage,
  reactionsByMessageId?: Map<string, DMReactionRow[]>,
  threadSummaryByMessageId?: Map<string, MessageThreadSummary>,
  viewerId?: string | null,
): DMMessagePayload {
  return mapDMReply(
    message,
    2,
    reactionsByMessageId,
    threadSummaryByMessageId,
    viewerId,
  ) as DMMessagePayload;
}

export async function mapDMMessagePayloadWithReactions(
  message: RawDMMessage,
  viewerId?: string | null,
): Promise<DMMessagePayload> {
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap([message.id]),
    getDMThreadSummaryMap([message.id]),
  ]);
  return mapDMMessagePayload(message, reactionsByMessageId, threadSummaryByMessageId, viewerId);
}

function getDeletedMessageLabelForLocale(locale: string | null | undefined) {
  return translate(normalizeAppLocale(locale), "dm.message.deleted");
}

export async function getDeletedMessageLabel(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });

  return getDeletedMessageLabelForLocale(user?.locale);
}

function resolveConversationName(conversation: RawDMConversation, viewerId: string) {
  if (conversation.name) {
    return conversation.name;
  }

  if (conversation.type !== "DM") {
    return null;
  }

  const otherParticipant = conversation.participants.find(
    (participant) => participant.userId !== viewerId,
  );

  return otherParticipant ? getDMDisplayName(otherParticipant.user) : null;
}

function mapConversationLastMessage(
  conversation: RawDMConversation,
  deletedMessageLabel: string,
  viewerId: string,
  /** 2c §7's floor for this viewer; null means the whole history is theirs. */
  historyFromAt?: Date | null,
) {
  const latestMessage = conversation.messages[0];

  // C4. Checked here rather than in `dmConversationInclude`, which is a static
  // object with no clock: the preview is one row already in memory, so an
  // in-memory comparison costs nothing and keeps the shared include untouched.
  // Between the deadline and the sweep the row simply has no preview, which is
  // the same thing the conversation shows the moment the sweep lands.
  if (!latestMessage || !isMessageUnexpired(latestMessage, new Date())) {
    return null;
  }

  // 2c §7 again. A member who joined under "Hiç" must not read the last message
  // through the inbox row either — the preview is the same content the message
  // list is refusing to serve them.
  if (historyFromAt && latestMessage.createdAt < historyFromAt) {
    return null;
  }

  const payload = mapDMMessagePayload(latestMessage, undefined, undefined, viewerId);

  if (!payload.deletedAt) {
    return payload;
  }

  return {
    ...payload,
    content: deletedMessageLabel,
  };
}

export async function mapDMConversationDTO(
  conversation: RawDMConversation,
  viewerId: string,
  deletedMessageLabel: string,
  /**
   * Pre-resolved for a page of conversations, so a list is one last-seen query
   * for every participant on the page rather than one per conversation.
   */
  lastSeenByUserId?: Map<string, string | null>,
): Promise<DMConversationDTO> {
  const [presenceState, resolvedLastSeenByUserId] = await Promise.all([
    readDMConversationPresenceState(conversation, viewerId),
    lastSeenByUserId ?? readDMConversationLastSeenMap(conversation),
  ]);
  return mapDMConversationDTOWithPresence(
    conversation,
    viewerId,
    deletedMessageLabel,
    presenceState.presenceByUserId,
    resolvedLastSeenByUserId,
    presenceState.hiddenUserIds,
  );
}

/**
 * Faz 1 §B3. A conversation row draws two tiles and two counters; a group
 * detail screen draws the roster. `"row"` keeps the first and drops the rest,
 * because a page of fifty 32-person groups otherwise ships 1600 participant
 * objects — each with presence and last-seen — for tiles nobody renders.
 *
 * The counters are computed before the trim, so `memberCount` and `onlineCount`
 * still describe the whole group.
 */
export type DMConversationRosterMode = "full" | "row";

function mapDMConversationDTOWithPresence(
  conversation: RawDMConversation,
  viewerId: string,
  deletedMessageLabel: string,
  presenceByUserId: Map<string, PresenceFields>,
  lastSeenByUserId: Map<string, string | null>,
  hiddenUserIds: ReadonlySet<string>,
  rosterMode: DMConversationRosterMode = "full",
): DMConversationDTO {
  const viewer = conversation.participants.find((participant) => participant.userId === viewerId);
  const participants = conversation.participants.map((participant) =>
    mapDMParticipantWithPresence(
      participant,
      presenceByUserId.get(participant.userId) ?? getPresenceFallback(participant),
      // An invisible participant publishes OFFLINE while still heartbeating, so
      // their last-seen would refresh forever and give the mode away.
      hiddenUserIds.has(participant.userId)
        ? null
        : (lastSeenByUserId.get(participant.userId) ?? null),
      viewerId,
    ),
  );
  // V7. Resolved here so the row, the header and the web sidebar all draw the
  // same two tiles instead of each walking `participants` its own way.
  const avatarPair = buildGroupAvatarPair(
    participants.map((participant) => ({
      avatarUrl: participant.avatarUrl,
      displayName: participant.displayName,
      joinedAt: participant.joinedAt ?? "",
      nameColor: participant.nameColor,
      userId: participant.userId,
      username: participant.username,
    })),
    viewerId,
  );
  // A 1:1 already has two participants, so the trim only ever bites on a group.
  const rosterUserIds =
    rosterMode === "row" && conversation.type === "GROUP_DM"
      ? new Set<string>([viewerId, ...avatarPair.tiles.map((tile) => tile.userId)])
      : null;
  const roster = rosterUserIds
    ? participants.filter((participant) => rosterUserIds.has(participant.userId))
    : participants;

  return {
    id: conversation.id,
    type: normalizeConversationType(conversation.type),
    name: resolveConversationName(conversation, viewerId),
    iconUrl: conversation.iconUrl,
    ownerId: conversation.ownerId,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    participants: roster,
    lastMessage: mapConversationLastMessage(
      conversation,
      deletedMessageLabel,
      viewerId,
      viewer?.historyFromAt ?? null,
    ),
    avatarColor: conversation.avatarColor,
    avatarPair: avatarPair.tiles,
    description: conversation.description,
    disappearingAfter: conversation.disappearingAfter,
    historyVisibility: conversation.historyVisibility,
    memberCount: conversation._count?.participants ?? conversation.participants.length,
    notifyLevel: viewer?.notifyLevel ?? "ALL",
    // Everybody who is not offline, the viewer included — 2d §1 reads
    // "6 üye · 3 çevrimiçi" against the same member count.
    //
    // Satır kipinde **verilmiyor**: katılımcı okuması sınırlı ve yüklenmiş
    // birkaç kişiyi saymak "3 çevrimiçi" yerine "2 çevrimiçi" yazmak olurdu.
    // Eksik bir sayaç, yanlış bir sayaçtan iyi — başlık tam konuşmayı çekiyor.
    ...(rosterMode === "full"
      ? {
          onlineCount: participants.filter((participant) => participant.status !== "OFFLINE")
            .length,
        }
      : {}),
    overflowCount: avatarPair.overflowCount,
    permissions: {
      addMembers: conversation.permAddMembers,
      editInfo: conversation.permEditInfo,
      pinMessage: conversation.permPinMessage,
      sendMessage: conversation.permSendMessage,
    },
    pinnedAt: viewer?.pinnedAt?.toISOString() ?? null,
    pinnedMessage: mapPinnedMessage(conversation, viewer),
    role: viewer?.role ?? "MEMBER",
  };
}

export type DMParticipantContext = {
  /** 2c §7's floor. Null means the member may read the whole conversation. */
  readonly historyFromAt: Date | null;
  readonly type: DMConversationType;
};

/**
 * The membership gate every DM read already went through — now it also answers
 * "how far back may this member read". Returning the floor from the check that
 * was happening anyway is what keeps 2c §7 enforced on all five read paths
 * without a second query on any of them.
 *
 * Still one statement: the membership row arrives as a filtered relation on the
 * conversation rather than as its own `findUnique`.
 */
export async function requireDMParticipant(
  userId: string,
  conversationId: string,
): Promise<DMParticipantContext> {
  const conversation = await prisma.dMConversation.findUnique({
    where: { id: conversationId },
    select: {
      type: true,
      participants: { where: { userId }, select: { historyFromAt: true } },
    },
  });
  const participant = conversation?.participants[0];

  if (!conversation || !participant) {
    throw new ApiError("You are not a participant in this conversation", 403);
  }

  return {
    historyFromAt: participant.historyFromAt,
    type: normalizeConversationType(conversation.type),
  };
}

/**
 * Merges 2c §7's floor into a cursor's ceiling. One `createdAt` key or the other
 * would silently drop whichever was written second.
 */
export function toHistoryWindowFilter(
  historyFromAt: Date | null,
  cursor: { createdAt: Date; id: string } | null,
): Prisma.DMMessageWhereInput {
  if (!historyFromAt && !cursor) {
    return {};
  }

  return {
    ...(historyFromAt ? { createdAt: { gte: historyFromAt } } : {}),
    ...(cursor
      ? {
          // createdAt is millisecond-precision. The id tie-breaker keeps rows at
          // the page boundary's exact timestamp reachable on the next page.
          AND: [
            {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            },
          ],
        }
      : {}),
  };
}

/**
 * C4. The read-side half of disappearing messages. The purge worker runs on a
 * 60-second tick, so between a message's deadline and its deletion there is a
 * window where the row is still there — every read filters it out so nobody sees
 * a message that has already expired.
 *
 * Served by `DMMessage_expiresAt_idx` when the planner wants it, and by the
 * conversation index otherwise; either way it never widens a page.
 */
export function toUnexpiredFilter(now: Date) {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

/** The same rule for a row already in memory. */
export function isMessageUnexpired(
  message: { expiresAt?: Date | null | undefined },
  now: Date,
): boolean {
  return !message.expiresAt || message.expiresAt.getTime() > now.getTime();
}

async function findDirectConversation(userId: string, targetUserId: string) {
  return prisma.dMConversation.findFirst({
    where: {
      type: "DM",
      AND: [
        {
          participants: {
            some: { userId },
          },
        },
        {
          participants: {
            some: { userId: targetUserId },
          },
        },
        {
          participants: {
            every: {
              userId: { in: [userId, targetUserId] },
            },
          },
        },
      ],
    },
    include: dmConversationInclude,
  });
}

export async function createOrOpenDirectMessage(
  userId: string,
  targetUserId: string,
): Promise<DMConversationDTO> {
  if (userId === targetUserId) {
    throw new ApiError("Cannot DM yourself", 400);
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (!targetUser) {
    throw new ApiError("User not found", 404, "NOT_FOUND");
  }

  const blockStatus = await getBlockStatus(userId, targetUserId);
  if (blockStatus.blocked) {
    throw new ApiError("You cannot DM this user", 403, "BLOCKED");
  }

  const [isFriend, targetSettings, sharesMutualServers] = await Promise.all([
    areFriends(userId, targetUserId),
    prisma.userSettings.findUnique({
      where: { userId: targetUserId },
      select: { dmPolicy: true },
    }),
    haveMutualServers(userId, targetUserId),
  ]);
  const dmPolicy = targetSettings?.dmPolicy ?? "FRIENDS";

  if (
    !canStartDirectMessage(dmPolicy, {
      areFriends: isFriend,
      haveMutualServers: sharesMutualServers,
    })
  ) {
    throw new ApiError("You cannot DM this user", 403, "DM_POLICY");
  }

  const existingConversation = await findDirectConversation(userId, targetUserId);
  const deletedMessageLabel = await getDeletedMessageLabel(userId);

  if (existingConversation) {
    const currentParticipant = existingConversation.participants.find(
      (participant) => participant.userId === userId,
    );

    if (currentParticipant?.hiddenAt) {
      await prisma.dMParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: existingConversation.id,
            userId,
          },
        },
        data: { hiddenAt: null },
      });
    }

    return await mapDMConversationDTO(existingConversation, userId, deletedMessageLabel);
  }

  const conversation = await prisma.dMConversation.create({
    data: {
      type: "DM",
      participants: {
        // `nameColor` is NOT NULL on every membership row, 1:1 included: the
        // column is required at compile time precisely so a new membership path
        // cannot forget it and fail at runtime instead.
        create: [
          { nameColor: pickNextMemberNameColor([]), userId },
          {
            nameColor: pickNextMemberNameColor([GROUP_MEMBER_NAME_COLORS[0]]),
            userId: targetUserId,
          },
        ],
      },
    },
    include: dmConversationInclude,
  });

  return await mapDMConversationDTO(conversation, userId, deletedMessageLabel);
}

/**
 * V3 / 2a §2. Pinning has to be part of the *server's* order, not a sort the
 * client applies to whatever page it happens to hold: a pinned conversation
 * whose last message is old would otherwise sit on page three and never reach
 * the SABİTLENEN section.
 *
 * `NULLS LAST` is expressed as a sentinel instead, because the same expression
 * has to appear in the keyset comparison and a null there would never compare.
 */
const UNPINNED_SORT_KEY = new Date(0);
const PINNED_SORT_KEY_SQL = Prisma.sql`COALESCE(p."pinnedAt", to_timestamp(0))`;

export async function listDirectMessages(
  userId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
): Promise<DMConversationsPageResponse> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  // Karar K8's lazy cleanup, run before the page is read so the rows this
  // response maps are already normalised. Only on the first page: the statement
  // covers every conversation this person has, so repeating it while the reader
  // scrolls would re-scan the same rows for nothing. See
  // `clearExpiredDirectMessageMutes` for why no scheduled sweep sits behind it.
  if (!options.cursor) {
    await clearExpiredDirectMessageMutes(userId);
  }
  const deletedMessageLabel = await getDeletedMessageLabel(userId);
  let cursorSql = Prisma.sql``;

  if (options.cursor) {
    const cursorParticipation = await prisma.dMParticipant.findFirst({
      where: {
        conversationId: options.cursor,
        userId,
      },
      select: {
        pinnedAt: true,
        conversation: {
          select: {
            id: true,
            lastMessageAt: true,
          },
        },
      },
    });

    if (!cursorParticipation) {
      throw new ApiError("Conversation not found", 404, "NOT_FOUND");
    }

    const cursorPinnedAt = cursorParticipation.pinnedAt ?? UNPINNED_SORT_KEY;

    cursorSql = Prisma.sql`
      AND (
        ${PINNED_SORT_KEY_SQL} < ${cursorPinnedAt}
        OR (
          ${PINNED_SORT_KEY_SQL} = ${cursorPinnedAt}
          AND (
            c."lastMessageAt" < ${cursorParticipation.conversation.lastMessageAt}
            OR (
              c."lastMessageAt" = ${cursorParticipation.conversation.lastMessageAt}
              AND c."id" < ${cursorParticipation.conversation.id}
            )
          )
        )
      )
    `;
  }

  const rows = await prisma.$queryRaw<DMConversationPageRow[]>(Prisma.sql`
    SELECT
      p."id" AS "participantId",
      p."conversationId" AS "conversationId"
    FROM "DMParticipant" p
    INNER JOIN "DMConversation" c
      ON c."id" = p."conversationId"
    WHERE p."userId" = ${userId}
      AND (
        p."hiddenAt" IS NULL
        OR c."lastMessageAt" > p."hiddenAt"
      )
      ${cursorSql}
    ORDER BY ${PINNED_SORT_KEY_SQL} DESC, c."lastMessageAt" DESC, c."id" DESC
    LIMIT ${limit + 1}
  `);

  const pageRows = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? (pageRows.at(-1)?.conversationId ?? null) : null;

  if (pageRows.length === 0) {
    return {
      conversations: [],
      nextCursor: null,
    };
  }

  const participations = await prisma.dMParticipant.findMany({
    where: {
      id: {
        in: pageRows.map((row) => row.participantId),
      },
    },
    include: {
      conversation: {
        include: dmConversationRowInclude,
      },
    },
  });

  const participationById = new Map(
    participations.map((participant) => [participant.id, participant]),
  );
  const pageParticipants = participations.flatMap(
    (participation) => participation.conversation.participants,
  );
  // One last-seen read and one presence read for the whole page. Both used to be
  // resolved inside the per-row mapper, which meant a `groupBy` and a Redis round
  // trip per conversation — 50 of each for a full page, and every group multiplied
  // the users each of those calls carried. `readPresenceState` dedupes ids itself.
  const subjectIds = pageParticipants.map((participant) => participant.userId);
  const [rawLastSeenByUserId, rawPresenceState, visibilityDecisions] = await Promise.all([
    resolveLastSeenAtByUserId(pageParticipants.map((participant) => participant.userId)),
    readPresenceState(
      getRedis(),
      pageParticipants.map((participant) => ({
        ...getPresenceFallback(participant),
        userId: participant.userId,
      })),
    ),
    resolveVisibilityDecisions(userId, subjectIds),
  ]);
  const presenceState = redactPresenceCollectionForViewer({
    decisions: visibilityDecisions,
    invisibleUserIds: rawPresenceState.hiddenUserIds,
    lastSeenByUserId: rawLastSeenByUserId,
    presenceByUserId: rawPresenceState.presenceByUserId,
    subjectIds,
  });
  const conversations = pageRows
    .map((row) => participationById.get(row.participantId))
    .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant))
    .map((participant) =>
      mapDMConversationDTOWithPresence(
        participant.conversation,
        userId,
        deletedMessageLabel,
        presenceState.presenceByUserId,
        presenceState.lastSeenByUserId,
        presenceState.hiddenUserIds,
        "row",
      ),
    );

  return {
    conversations,
    nextCursor,
  };
}

export async function getDirectMessageUnreadCount(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ totalUnreadCount: number }>>(Prisma.sql`
    SELECT COALESCE(SUM(p."unreadCount"), 0)::int AS "totalUnreadCount"
    FROM "DMParticipant" p
    INNER JOIN "DMConversation" c ON c."id" = p."conversationId"
    WHERE p."userId" = ${userId}
      AND (p."hiddenAt" IS NULL OR c."lastMessageAt" > p."hiddenAt")
  `);

  return rows[0]?.totalUnreadCount ?? 0;
}

export async function getDirectMessageConversationForUser(
  conversationId: string,
  userId: string,
): Promise<DMConversationDTO> {
  const [deletedMessageLabel, conversation] = await Promise.all([
    getDeletedMessageLabel(userId),
    prisma.dMConversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { userId },
        },
      },
      include: dmConversationInclude,
    }),
  ]);

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  return mapDMConversationDTO(conversation, userId, deletedMessageLabel);
}

export async function listDirectMessageMutualServers(
  requesterId: string,
  targetUserId: string,
  options: {
    limit?: number;
  } = {},
): Promise<DMMutualServerSummary[]> {
  if (!targetUserId || requesterId === targetUserId) {
    return [];
  }

  const limit = Math.min(Math.max(options.limit ?? 6, 1), 12);
  const memberships = await prisma.serverMember.findMany({
    where: {
      pending: false,
      userId: requesterId,
      server: {
        members: {
          some: {
            pending: false,
            userId: targetUserId,
          },
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
    select: {
      server: {
        select: {
          _count: {
            select: {
              members: true,
            },
          },
          iconColor: true,
          iconUrl: true,
          id: true,
          name: true,
          shortName: true,
        },
      },
    },
    take: limit,
  });

  return memberships.map(({ server }) => ({
    iconColor: normalizeServerIconTone(server.iconColor),
    iconUrl: server.iconUrl,
    id: server.id,
    memberCount: server._count.members,
    name: server.name,
    shortName: server.shortName,
  }));
}

export async function getDirectMessageConversationRealtimeViews(
  conversationId: string,
  userIds: string[],
): Promise<
  Array<{
    conversation: DMConversationDTO;
    participantId: string;
    unreadCount: number;
  }>
> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const conversation = await prisma.dMConversation.findUnique({
    where: { id: conversationId },
    include: dmConversationInclude,
  });

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  const participantIds = new Set(
    conversation.participants.map((participant) => participant.userId),
  );
  const latestMessageDeleted = Boolean(conversation.messages[0]?.deletedAt);
  const [localeByUserId, lastSeenByUserId, presenceStates] = await Promise.all([
    latestMessageDeleted
      ? prisma.user
          .findMany({
            where: { id: { in: uniqueUserIds } },
            select: { id: true, locale: true },
          })
          .then((users) => new Map(users.map((user) => [user.id, user.locale])))
      : Promise.resolve(new Map<string, string | null>()),
    readDMConversationLastSeenMap(conversation),
    Promise.all(
      uniqueUserIds.map(
        async (viewerId) =>
          [viewerId, await readDMConversationPresenceState(conversation, viewerId)] as const,
      ),
    ),
  ]);
  const presenceStateByViewerId = new Map(presenceStates);
  const defaultDeletedMessageLabel = getDeletedMessageLabelForLocale(null);

  return uniqueUserIds
    .filter((userId) => participantIds.has(userId))
    .map((participantId) => {
      const currentParticipant = conversation.participants.find(
        (candidate) => candidate.userId === participantId,
      );
      const presenceState = presenceStateByViewerId.get(participantId);
      if (!presenceState) {
        return null;
      }

      return {
        participantId,
        unreadCount: currentParticipant?.unreadCount ?? 0,
        conversation: mapDMConversationDTOWithPresence(
          conversation,
          participantId,
          latestMessageDeleted
            ? getDeletedMessageLabelForLocale(localeByUserId.get(participantId))
            : defaultDeletedMessageLabel,
          presenceState.presenceByUserId,
          new Map(
            [...lastSeenByUserId].map(([userId, value]) => [
              userId,
              presenceState.hiddenUserIds.has(userId) ? null : value,
            ]),
          ),
          presenceState.hiddenUserIds,
        ),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export async function listDMMessages(
  userId: string,
  conversationId: string,
  cursor: string | undefined,
  limit: number,
): Promise<DMMessagesResponse> {
  const membership = await requireDMParticipant(userId, conversationId);

  let cursorMessage: { createdAt: Date; id: string } | null = null;
  if (cursor) {
    cursorMessage = await prisma.dMMessage.findFirst({
      where: {
        id: cursor,
        conversationId,
      },
      select: { createdAt: true, id: true },
    });

    if (!cursorMessage) {
      throw new ApiError("Message not found", 404, "NOT_FOUND");
    }
  }

  const messages = await prisma.dMMessage.findMany({
    where: {
      conversationId,
      // §6.1: kök mesajlar **ve** yazarının ana sohbete de gönderdiği thread
      // yanıtları. Yalnız `threadParentId: null` olsaydı işaretlenen kutu hiçbir
      // şey değiştirmezdi.
      //
      // `AND` içinde: `toUnexpiredFilter` de bir `OR` üretiyor ve iki `OR` aynı
      // nesnede yan yana durursa ikincisi birincisini **sessizce** ezer.
      AND: [{ OR: [{ threadParentId: null }, { alsoSentToChannel: true }] }],
      placeholderRemovedAt: null,
      // 2c §7. Served by the existing `[conversationId, createdAt]` index.
      ...toHistoryWindowFilter(membership.historyFromAt, cursorMessage),
      // C4. The sweep may be up to a minute behind; the reader must not be.
      ...toUnexpiredFilter(new Date()),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: dmMessageInclude,
  });

  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? (pageMessages[pageMessages.length - 1]?.id ?? null) : null;
  const messageIds = pageMessages.map((message) => message.id);
  const [reactionsByMessageId, threadSummaryByMessageId, readStates] = await Promise.all([
    getDMReactionMap(messageIds),
    getDMThreadSummaryMap(messageIds),
    // 2d §8 lives under the newest outgoing bubble only, so older pages never
    // pay for it — and neither does a 1:1, which has ticks instead.
    membership.type === "GROUP_DM" && cursor === undefined
      ? getDirectMessageParticipantReadStates(conversationId)
      : Promise.resolve(null),
  ]);

  const payloads = [...pageMessages]
    .reverse()
    .map((message) =>
      mapDMMessagePayload(message, reactionsByMessageId, threadSummaryByMessageId, userId),
    );

  return {
    messages: readStates ? attachGroupReadReceipt(payloads, userId, readStates) : payloads,
    nextCursor,
  };
}

/**
 * §4.5. One receipt per page, on the newest message the viewer sent — the design
 * only ever draws it under the last outgoing bubble, and a per-message version
 * would be a query per bubble.
 */
function attachGroupReadReceipt(
  messages: DMMessagePayload[],
  viewerId: string,
  participants: ReadonlyArray<{ lastReadAt: Date | null; userId: string }>,
): DMMessagePayload[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (!message || message.userId !== viewerId || message.systemType || message.deletedAt) {
      continue;
    }

    messages[index] = {
      ...message,
      readReceipt: buildGroupReadReceipt({
        authorId: viewerId,
        createdAt: new Date(message.createdAt),
        participants,
      }),
    };
    break;
  }

  return messages;
}

export async function listDMThreadMessages(
  userId: string,
  conversationId: string,
  parentMessageId: string,
  cursor: string | undefined,
  limit: number,
): Promise<DMMessagesResponse & { parent: DMMessagePayload }> {
  const membership = await requireDMParticipant(userId, conversationId);

  const parent = await prisma.dMMessage.findFirst({
    where: {
      id: parentMessageId,
      conversationId,
      threadParentId: null,
      placeholderRemovedAt: null,
      // A thread is opened from its parent, so the parent has to be inside the
      // window too — otherwise the deep link is a way around 2c §7.
      ...toHistoryWindowFilter(membership.historyFromAt, null),
      // Same reason for C4: an expired parent must not be readable through the
      // thread route either.
      ...toUnexpiredFilter(new Date()),
    },
    include: dmMessageInclude,
  });

  if (!parent) {
    throw new ApiError("Thread parent message not found", 404, "THREAD_PARENT_NOT_FOUND");
  }

  let cursorMessage: { createdAt: Date; id: string } | null = null;
  if (cursor) {
    cursorMessage = await prisma.dMMessage.findFirst({
      where: {
        id: cursor,
        conversationId,
        threadParentId: parentMessageId,
      },
      select: { createdAt: true, id: true },
    });

    if (!cursorMessage) {
      throw new ApiError("Message not found", 404, "NOT_FOUND");
    }
  }

  const messages = await prisma.dMMessage.findMany({
    where: {
      conversationId,
      threadParentId: parentMessageId,
      placeholderRemovedAt: null,
      ...toHistoryWindowFilter(membership.historyFromAt, cursorMessage),
      ...toUnexpiredFilter(new Date()),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: dmMessageInclude,
  });

  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? (pageMessages[pageMessages.length - 1]?.id ?? null) : null;
  const messageIds = [parent.id, ...pageMessages.map((message) => message.id)];
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap(messageIds),
    getDMThreadSummaryMap([parent.id]),
  ]);

  return {
    parent: mapDMMessagePayload(parent, reactionsByMessageId, threadSummaryByMessageId, userId),
    messages: [...pageMessages]
      .reverse()
      .map((message) => mapDMMessagePayload(message, reactionsByMessageId, undefined, userId)),
    nextCursor,
  };
}

export async function markDirectMessageRead(userId: string, conversationId: string) {
  await requireDMParticipant(userId, conversationId);

  await prisma.dMParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      lastReadAt: new Date(),
      // Opening the conversation acknowledges both badge sources; clearing
      // unreadCount alone left group mentions permanently visible.
      mentionCount: 0,
      unreadCount: 0,
    },
  });
}

export async function getDirectMessageParticipantReadStates(conversationId: string) {
  return prisma.dMParticipant.findMany({
    where: { conversationId },
    orderBy: { userId: "asc" },
    select: { lastDeliveredAt: true, lastReadAt: true, userId: true },
  });
}

export type DirectMessageDeliveryMark = {
  readonly conversationId: string;
  readonly lastDeliveredAt: Date;
  /** Everyone to notify, the delivering participant included. */
  readonly participantUserIds: readonly string[];
};

/**
 * Messaging redesign §2 "1a".6.4: marks that this participant's client now holds
 * everything in these conversations, which is the sender's second tick.
 *
 * Only conversations whose newest message is younger than the existing mark are
 * touched, so re-opening the list on a quiet account writes nothing and emits
 * nothing. Membership is the `where` clause rather than a separate guard: a
 * conversation the caller does not participate in simply matches no row.
 */
export async function markDirectMessagesDelivered(
  userId: string,
  conversationIds: readonly string[],
  now: Date = new Date(),
): Promise<readonly DirectMessageDeliveryMark[]> {
  const ids = [...new Set(conversationIds)].filter((id) => id.length > 0);
  if (ids.length === 0) {
    return [];
  }

  const rows = await prisma.dMParticipant.findMany({
    where: { conversationId: { in: ids }, userId },
    select: {
      conversationId: true,
      lastDeliveredAt: true,
      conversation: {
        select: {
          lastMessageAt: true,
          participants: { select: { userId: true } },
        },
      },
    },
  });

  const stale = rows.filter((row) => {
    const { lastMessageAt } = row.conversation;
    return lastMessageAt !== null && (!row.lastDeliveredAt || row.lastDeliveredAt < lastMessageAt);
  });
  if (stale.length === 0) {
    return [];
  }

  await prisma.dMParticipant.updateMany({
    where: { conversationId: { in: stale.map((row) => row.conversationId) }, userId },
    data: { lastDeliveredAt: now },
  });

  return stale.map((row) => ({
    conversationId: row.conversationId,
    lastDeliveredAt: now,
    participantUserIds: row.conversation.participants.map((participant) => participant.userId),
  }));
}

export async function markDirectMessageUnread(userId: string, conversationId: string) {
  await requireDMParticipant(userId, conversationId);

  await prisma.dMParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      lastReadAt: null,
      unreadCount: 1,
    },
  });
}

export type DirectMessageMuteState = {
  muted: boolean;
  mutedUntil: string | null;
  notifyLevel: DMNotifyLevel;
};

export type SetDirectMessageMutedDependencies = {
  /**
   * The same person's other tabs draw the header's `Sessize alındı` pill, and
   * nobody else may see this setting — so the fan-out is the personal room, not
   * the conversation room. `dm:conversation:notify` already established that
   * shape for the twin column; this is the same channel, one event further.
   */
  emitMuteChanged(
    userId: string,
    payload: DirectMessageMuteState & { conversationId: string },
  ): void;
  now(): Date;
};

const setDirectMessageMutedDefaults: SetDirectMessageMutedDependencies = {
  emitMuteChanged(userId, payload) {
    getSocketServer()?.to(`user:${userId}`).emit("dm:conversation:mute", payload);
  },
  now: () => new Date(),
};

/**
 * §17's `Sessize al` submenu (karar K8).
 *
 * `muted` and `notifyLevel` are twins and are written in the **same** statement,
 * the invariant `setNotifyLevel` already carries from the other direction: a
 * crash between two updates is what leaves the app silent in one surface and
 * loud in another.
 *
 * The old body — a bare boolean, or `{ muted }` with no duration — still means
 * "forever", so every caller written before the submenu existed keeps working.
 *
 * Unmuting restores `ALL` rather than whatever tier preceded the mute: no column
 * stores the previous tier, and inventing one for a value the notification radio
 * can set directly would be a second source of truth for the same setting.
 */
export async function setDirectMessageMuted(
  userId: string,
  conversationId: string,
  input: boolean | SetMutedRequest,
  dependencies: SetDirectMessageMutedDependencies = setDirectMessageMutedDefaults,
): Promise<DirectMessageMuteState> {
  await requireDMParticipant(userId, conversationId);

  const request: SetMutedRequest = typeof input === "boolean" ? { muted: input } : input;
  const now = dependencies.now();
  const mutedUntil = request.muted ? resolveMutedUntil(request.duration ?? "forever", now) : null;
  const notifyLevel: DMNotifyLevel = request.muted ? "NONE" : "ALL";

  await prisma.dMParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      muted: request.muted,
      mutedUntil,
      notifyLevel,
    },
  });

  const state: DirectMessageMuteState = {
    muted: request.muted,
    mutedUntil: mutedUntil?.toISOString() ?? null,
    notifyLevel,
  };

  dependencies.emitMuteChanged(userId, { ...state, conversationId });

  return state;
}

/**
 * Karar K8's lazy half.
 *
 * There is deliberately **no** scheduled sweep. A timer that clears expired
 * mutes would be a second authority on "is this muted", and the moment it lags
 * — a stopped worker, a deploy gap — the answer would depend on which of the two
 * ran last. `isMuteActive` makes an expired row inert wherever it is read, so
 * correctness never waits on a job; this write only stops stale rows from
 * accumulating, and it is allowed to fail without changing any answer.
 *
 * It runs on the conversation-list read: the one request that already touches
 * every conversation this person has, so the cleanup costs one statement per
 * inbox open instead of one per conversation.
 */
export async function clearExpiredDirectMessageMutes(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.dMParticipant.updateMany({
    where: {
      muted: true,
      mutedUntil: { lte: now },
      userId,
    },
    data: {
      muted: false,
      mutedUntil: null,
      notifyLevel: "ALL",
    },
  });

  return count;
}

export async function hideDirectMessage(userId: string, conversationId: string) {
  await requireDMParticipant(userId, conversationId);

  await prisma.dMParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      hiddenAt: new Date(),
    },
  });
}

type DMMessageMutationOptions = {
  conversationId?: string;
};

export type DMMessageRealtimeView = {
  message: DMMessagePayload;
  userId: string;
};

export type DMMessageEditResult = {
  message: DMMessagePayload;
  realtimeViews: DMMessageRealtimeView[];
};

export type DMDeleteMessageResult =
  | {
      conversationId: string;
      placeholderExpiresAt: null;
      status: "deleted";
    }
  | {
      conversationId: string;
      status: "removed";
    };

function validateEditableDMMessageContent(content: unknown) {
  const nextContent = typeof content === "string" ? content.trim() : "";
  if (!nextContent || nextContent.length > MESSAGE_CONTENT_DEFAULT_LIMIT) {
    throw new ApiError(
      `Message content must be between 1 and ${MESSAGE_CONTENT_DEFAULT_LIMIT} characters.`,
      400,
      "VALIDATION_ERROR",
    );
  }

  return nextContent;
}

async function mapDMMessageRealtimeViews(message: RawDMMessage, userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap([message.id]),
    getDMThreadSummaryMap([message.id]),
  ]);

  return uniqueUserIds.map((userId) => ({
    message: mapDMMessagePayload(message, reactionsByMessageId, threadSummaryByMessageId, userId),
    userId,
  }));
}

export async function editDMMessage(
  messageId: string,
  userId: string,
  content: string,
  options: DMMessageMutationOptions = {},
): Promise<DMMessageEditResult> {
  const existingMessage = await prisma.dMMessage.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      deletedAt: true,
      placeholderRemovedAt: true,
      userId: true,
    },
  });

  if (
    !existingMessage ||
    existingMessage.deletedAt ||
    existingMessage.placeholderRemovedAt ||
    (options.conversationId && existingMessage.conversationId !== options.conversationId)
  ) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  await requireDMParticipant(userId, existingMessage.conversationId);

  if (existingMessage.userId !== userId) {
    throw new ApiError("You can only edit your own DM messages.", 403, "FORBIDDEN");
  }

  const nextContent = validateEditableDMMessageContent(content);
  let updatedMessage: RawDMMessage;
  try {
    updatedMessage = await prisma.dMMessage.update({
      where: {
        id: messageId,
        userId,
        deletedAt: null,
        placeholderRemovedAt: null,
      },
      data: {
        content: nextContent,
        editedAt: new Date(),
      },
      include: dmMessageInclude,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ApiError("Message not found", 404, "NOT_FOUND");
    }

    throw error;
  }

  const participants = await prisma.dMParticipant.findMany({
    where: { conversationId: existingMessage.conversationId },
    select: { userId: true },
  });
  const realtimeViews = await mapDMMessageRealtimeViews(
    updatedMessage,
    participants.map((participant) => participant.userId),
  );
  const actorView = realtimeViews.find((view) => view.userId === userId);

  if (!actorView) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  return {
    message: actorView.message,
    realtimeViews,
  };
}

export async function deleteDMMessage(
  messageId: string,
  userId: string,
  options: DMMessageMutationOptions = {},
): Promise<DMDeleteMessageResult> {
  const existingMessage = await prisma.dMMessage.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      deletedAt: true,
      deletedById: true,
      placeholderRemovedAt: true,
      userId: true,
    },
  });

  if (
    !existingMessage ||
    existingMessage.placeholderRemovedAt ||
    (options.conversationId && existingMessage.conversationId !== options.conversationId)
  ) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  await requireDMParticipant(userId, existingMessage.conversationId);

  if (existingMessage.deletedAt) {
    const canRemovePlaceholder =
      existingMessage.deletedById === userId ||
      (!existingMessage.deletedById && existingMessage.userId === userId);

    if (!canRemovePlaceholder) {
      throw new ApiError("You can only remove your own deleted DM notices.", 403, "FORBIDDEN");
    }

    const removeResult = await prisma.dMMessage.updateMany({
      where: {
        deletedAt: { not: null },
        id: messageId,
        placeholderRemovedAt: null,
      },
      data: {
        placeholderRemovedAt: new Date(),
      },
    });

    if (removeResult.count !== 1) {
      throw new ApiError("Message not found", 404, "NOT_FOUND");
    }

    return { conversationId: existingMessage.conversationId, status: "removed" };
  }

  if (existingMessage.userId !== userId) {
    throw new ApiError("You can only delete your own DM messages.", 403, "FORBIDDEN");
  }

  const deleteResult = await prisma.dMMessage.updateMany({
    where: {
      deletedAt: null,
      id: messageId,
      placeholderRemovedAt: null,
      userId,
    },
    data: {
      deletedAt: new Date(),
      deletedById: userId,
    },
  });

  if (deleteResult.count !== 1) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  return {
    conversationId: existingMessage.conversationId,
    placeholderExpiresAt: null,
    status: "deleted",
  };
}

export async function toggleDMReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<MessageReaction[]> {
  return setDMReaction(messageId, userId, emoji, undefined);
}

export async function setDMReaction(
  messageId: string,
  userId: string,
  emoji: string,
  shouldReact: boolean | undefined,
  options: { conversationId?: string } = {},
): Promise<MessageReaction[]> {
  const normalizedEmoji = validateDMReactionEmoji(emoji);
  const message = await prisma.dMMessage.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      deletedAt: true,
      placeholderRemovedAt: true,
    },
  });

  if (!message || message.deletedAt || message.placeholderRemovedAt) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  if (options.conversationId && message.conversationId !== options.conversationId) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  await requireDMParticipant(userId, message.conversationId);

  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "DMReaction"
    WHERE "messageId" = ${messageId}
      AND "userId" = ${userId}
      AND "emoji" = ${normalizedEmoji}
    LIMIT 1
  `);

  if (existing[0] && shouldReact !== true) {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "DMReaction"
      WHERE "id" = ${existing[0].id}
    `);
  } else if (!existing[0] && shouldReact !== false) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "DMReaction" ("id", "messageId", "userId", "emoji", "createdAt")
      VALUES (${randomUUID()}, ${messageId}, ${userId}, ${normalizedEmoji}, CURRENT_TIMESTAMP)
    `);
  }

  const reactions = await prisma.$queryRaw<DMReactionRow[]>(Prisma.sql`
    SELECT
      r."messageId",
      r."emoji",
      r."userId",
      r."createdAt",
      u."username",
      u."displayName",
      u."avatarUrl"
    FROM "DMReaction" r
    INNER JOIN "User" u ON u."id" = r."userId"
    WHERE r."messageId" = ${messageId}
  `);

  return groupDMReactions(reactions);
}
