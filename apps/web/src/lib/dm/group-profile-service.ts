import {
  mapLegacyGroupAvatarColor,
  resolveProfileTint,
  isMuteActive,
  type DMNotifyLevel,
  type DMParticipantRole,
  type GroupHistoryVisibility,
  type GroupMemberPage,
  type GroupMemberRowDTO,
  type GroupPermissionLevel,
  type GroupProfilePanelDTO,
  type PinnedMessageDTO,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { readGroupInvite } from "@/lib/dm/group-invite-service";
import { listConversationPins } from "@/lib/dm/pins-service";
import { resolveLastSeenAtByUserId } from "@/lib/friends/last-seen";
import { toInitials, toMessagesPresence } from "@/lib/messages/rail-presentation";
import { readPresenceState, type VisiblePresenceStatus } from "@/lib/presence";
import {
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
} from "@/lib/privacy/visibility-policy";
import { getRedis } from "@/lib/redis";

/**
 * SPEC §15's **group** arm and §15.4's roster — the read side only. Every admin
 * action lives in `group-service.ts`; this module answers questions.
 *
 * Two rules shape the whole file:
 *
 * - **`viewerRole` is information, never authority.** It travels so the panel can
 *   hide rows a member cannot use, but every write re-derives the role from the
 *   database. A client that renames itself OWNER gets a 403, not a shortcut.
 * - **Presence is redacted before it is counted.** The roster and the
 *   `3 çevrimiçi` counter both run through the same visibility policy the rest of
 *   the DM surface uses, so an invisible member is offline here too.
 */

/** §15.4's page size. A group holds at most 250, so this is one round trip for most. */
export const GROUP_MEMBER_PAGE_SIZE = 50;
const GROUP_MEMBER_PAGE_MAX = 100;

export type GroupProfileParticipantRow = {
  readonly joinedAt: Date;
  readonly muted: boolean;
  readonly mutedUntil: Date | null;
  readonly notifyLevel: DMNotifyLevel;
  readonly role: DMParticipantRole;
  readonly user: {
    /** The stored status line, used when Redis has no live record for the member. */
    readonly customStatus: string | null;
    readonly displayName: string | null;
    readonly username: string;
  };
  readonly userId: string;
};

/** What presence is read for: the id plus the fallback its own row already carries. */
export type GroupProfilePresenceSubject = {
  readonly customStatus: string | null;
  readonly userId: string;
};

export type GroupProfileConversationRow = {
  readonly avatarColor: string | null;
  readonly createdAt: Date;
  readonly description: string | null;
  readonly historyVisibility: GroupHistoryVisibility;
  readonly id: string;
  readonly name: string | null;
  readonly ownerId: string | null;
  readonly participants: readonly GroupProfileParticipantRow[];
  readonly permAddMembers: GroupPermissionLevel;
  readonly type: string;
};

/** Presence as the panel needs it: already redacted for the viewer. */
export type GroupProfilePresence = {
  readonly customStatus: string | null;
  readonly lastSeenAt: string | null;
  readonly status: VisiblePresenceStatus;
};

export type GroupProfileServiceDependencies = {
  /** The whole roster in one read; a group is capped at 250 rows. */
  loadConversation(conversationId: string): Promise<GroupProfileConversationRow | null>;
  /** §15.3.6. The existing pins read, not a second one. */
  loadPins(conversationId: string, viewerId: string): Promise<PinnedMessageDTO[]>;
  /** §15.4's `DAVET BAĞLANTISI`. Re-checks membership itself. */
  loadInvite(
    viewerId: string,
    conversationId: string,
  ): Promise<{ code: string | null; expiresAt: string | null; url: string | null }>;
  /**
   * K8. Clears a mute whose end has passed. A write inside a read is deliberate
   * and bounded: it fires only on the request that first observes the expiry,
   * and the schema comment rules out a scheduled sweep for exactly this reason.
   */
  clearExpiredMute(conversationId: string, userId: string): Promise<void>;
  now(): Date;
  /**
   * Presence **and** last-seen come back from one call because they have to be
   * redacted together — fetching last-seen separately would hand out an activity
   * timestamp for somebody whose presence the policy just hid.
   */
  readPresence(
    viewerId: string,
    subjects: readonly GroupProfilePresenceSubject[],
    includeLastSeen: boolean,
  ): Promise<Map<string, GroupProfilePresence>>;
};

const groupProfileParticipantSelect = {
  joinedAt: true,
  muted: true,
  mutedUntil: true,
  notifyLevel: true,
  role: true,
  user: { select: { customStatus: true, displayName: true, username: true } },
  userId: true,
} as const;

const defaults: GroupProfileServiceDependencies = {
  clearExpiredMute: async (conversationId, userId) => {
    await prisma.dMParticipant.updateMany({
      data: { muted: false, mutedUntil: null },
      // `muted` and `notifyLevel` are twins (2f §2), but an expiring *timer* is
      // not a notification-tier change: the member picked `Sadece bahsedilmeler`
      // or `Tüm mesajlar` before muting, and that choice comes back untouched.
      where: { conversationId, userId },
    });
  },
  loadConversation: (conversationId) =>
    prisma.dMConversation.findUnique({
      where: { id: conversationId },
      select: {
        avatarColor: true,
        createdAt: true,
        description: true,
        historyVisibility: true,
        id: true,
        name: true,
        ownerId: true,
        participants: {
          orderBy: { joinedAt: "asc" },
          select: groupProfileParticipantSelect,
        },
        permAddMembers: true,
        type: true,
      },
    }),
  loadInvite: async (viewerId, conversationId) => {
    const invite = await readGroupInvite(viewerId, conversationId);

    return { code: invite.code, expiresAt: invite.expiresAt, url: invite.url };
  },
  loadPins: (conversationId, viewerId) => listConversationPins(conversationId, viewerId),
  now: () => new Date(),
  readPresence: async (viewerId, subjects, includeLastSeen) => {
    const ids = [...new Set(subjects.map((subject) => subject.userId))];

    if (ids.length === 0) {
      return new Map();
    }

    const [presenceState, lastSeenByUserId, decisions] = await Promise.all([
      readPresenceState(
        getRedis(),
        subjects.map((subject) => ({
          customStatus: subject.customStatus,
          status: "OFFLINE" as const,
          userId: subject.userId,
        })),
      ),
      includeLastSeen
        ? resolveLastSeenAtByUserId(ids)
        : Promise.resolve(new Map<string, string | null>()),
      resolveVisibilityDecisions(viewerId, ids),
    ]);
    const redacted = redactPresenceCollectionForViewer({
      decisions,
      invisibleUserIds: presenceState.hiddenUserIds,
      lastSeenByUserId,
      presenceByUserId: presenceState.presenceByUserId,
      subjectIds: ids,
    });

    return new Map(
      ids.map((userId) => [
        userId,
        {
          customStatus: redacted.presenceByUserId.get(userId)?.customStatus ?? null,
          lastSeenAt: redacted.lastSeenByUserId.get(userId) ?? null,
          status: redacted.presenceByUserId.get(userId)?.status ?? "OFFLINE",
        },
      ]),
    );
  },
};

/** A person's name as every DM surface already renders it: display name, else handle. */
function toDisplayName(user: { displayName: string | null; username: string }): string {
  return user.displayName ?? user.username;
}

/**
 * The gate every read in this module goes through. Order is deliberate and the
 * tests pin it: a stranger gets 403 before the conversation's type is revealed,
 * and only a member is told that the id belongs to a 1:1 rather than a group.
 */
export function requireGroupProfileContext(
  conversation: GroupProfileConversationRow | null,
  viewerId: string,
): { conversation: GroupProfileConversationRow; viewer: GroupProfileParticipantRow } {
  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  const viewer = conversation.participants.find((participant) => participant.userId === viewerId);

  if (!viewer) {
    throw new ApiError("You are not a participant in this conversation", 403, "FORBIDDEN");
  }

  if (conversation.type !== "GROUP_DM") {
    throw new ApiError("This conversation is not a group", 400, "NOT_A_GROUP");
  }

  return { conversation, viewer };
}

export async function getGroupProfilePanel(
  viewerId: string,
  conversationId: string,
  dependencies: GroupProfileServiceDependencies = defaults,
): Promise<GroupProfilePanelDTO> {
  const { conversation, viewer } = requireGroupProfileContext(
    await dependencies.loadConversation(conversationId),
    viewerId,
  );
  const subjects = conversation.participants.map((participant) => ({
    customStatus: participant.user.customStatus,
    userId: participant.userId,
  }));

  // Three independent reads, so they run together. The panel's own §7 rule says
  // no section waits on another; the same applies one layer down.
  const [presenceByUserId, pinnedMessages, invite] = await Promise.all([
    dependencies.readPresence(viewerId, subjects, false),
    dependencies.loadPins(conversationId, viewerId),
    dependencies.loadInvite(viewerId, conversationId),
  ]);

  const now = dependencies.now();
  const muteActive = isMuteActive({ muted: viewer.muted, mutedUntil: viewer.mutedUntil }, now);

  // K8's lazy cleanup. Only the request that first sees the expiry pays for it,
  // and the row is left honest for every later reader.
  if (viewer.muted && !muteActive) {
    await dependencies.clearExpiredMute(conversationId, viewerId);
  }

  const owner = conversation.participants.find(
    (participant) => participant.userId === conversation.ownerId,
  );
  const name = conversation.name ?? "";

  return {
    addPolicy: conversation.permAddMembers,
    // Tuzak 4: the column stores a swatch **name**. `mapLegacyGroupAvatarColor`
    // is what turns the handful of rows that still hold a legacy hex back into
    // one, so no raw colour ever leaves the server.
    avatarColor: mapLegacyGroupAvatarColor(conversation.avatarColor),
    conversationId: conversation.id,
    createdAt: conversation.createdAt.toISOString(),
    description: conversation.description,
    historyVisibility: conversation.historyVisibility,
    initials: toInitials(name),
    // The full URL, not the display form §15.4 draws. A link that has to be
    // copyable cannot be shipped with its scheme stripped; the panel trims it.
    invite:
      invite.code && invite.url
        ? { code: invite.code, expiresAt: invite.expiresAt, url: invite.url }
        : null,
    memberCount: conversation.participants.length,
    muted: muteActive,
    mutedUntil: muteActive ? (viewer.mutedUntil?.toISOString() ?? null) : null,
    name,
    notifyLevel: viewer.notifyLevel,
    // Same rule the conversation DTO already uses: "çevrimiçi" is everybody who
    // is not offline, so `Boşta` and `Rahatsız etmeyin` still count as present.
    // A member the presence read said nothing about falls back to OFFLINE, not
    // to `undefined !== "OFFLINE"` — a Redis miss must not inflate the counter.
    onlineCount: subjects.filter(
      (subject) => (presenceByUserId.get(subject.userId)?.status ?? "OFFLINE") !== "OFFLINE",
    ).length,
    ownerName: owner ? toDisplayName(owner.user) : null,
    pinnedMessages,
    viewerRole: viewer.role,
  };
}

type GroupMemberSortKey = {
  readonly name: string;
  /** Two tiers, because §15.4 draws two headings: `YÖNETİCİ` and `ÜYE`. */
  readonly tier: number;
  readonly userId: string;
};

function toSortKey(participant: GroupProfileParticipantRow): GroupMemberSortKey {
  return {
    name: toDisplayName(participant.user),
    tier: participant.role === "MEMBER" ? 1 : 0,
    userId: participant.userId,
  };
}

/**
 * Admins first, then name, then id. The id tiebreak is not decoration: without
 * it two members sharing a display name would order differently between two
 * requests, and a cursor built on an unstable order skips or repeats rows.
 */
export function compareGroupMemberSortKeys(
  left: GroupMemberSortKey,
  right: GroupMemberSortKey,
): number {
  if (left.tier !== right.tier) {
    return left.tier - right.tier;
  }

  // `tr` collation: `Işık` and `İpek` sort by Turkish rules, not by code point.
  const byName = left.name.localeCompare(right.name, "tr");

  return byName !== 0 ? byName : left.userId.localeCompare(right.userId);
}

export function encodeGroupMemberCursor(key: GroupMemberSortKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

export function decodeGroupMemberCursor(
  cursor: string | null | undefined,
): GroupMemberSortKey | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<GroupMemberSortKey>;

    if (
      typeof parsed.name !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.tier !== "number"
    ) {
      return null;
    }

    return { name: parsed.name, tier: parsed.tier, userId: parsed.userId };
  } catch {
    // A malformed cursor reads as "start from the beginning" rather than a 400:
    // it is the client's own opaque token, and a stale one must not strand a
    // panel that simply came back from a cache.
    return null;
  }
}

export function normalizeGroupMemberLimit(limit: number | null | undefined): number {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return GROUP_MEMBER_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(limit as number), 1), GROUP_MEMBER_PAGE_MAX);
}

export type ListGroupMembersOptions = {
  readonly cursor?: string | null;
  readonly limit?: number | null;
};

export async function listGroupMembers(
  viewerId: string,
  conversationId: string,
  options: ListGroupMembersOptions = {},
  dependencies: GroupProfileServiceDependencies = defaults,
): Promise<GroupMemberPage> {
  const { conversation } = requireGroupProfileContext(
    await dependencies.loadConversation(conversationId),
    viewerId,
  );

  const limit = normalizeGroupMemberLimit(options.limit);
  const cursor = decodeGroupMemberCursor(options.cursor);
  const sorted = [...conversation.participants]
    .map((participant) => ({ key: toSortKey(participant), participant }))
    .sort((left, right) => compareGroupMemberSortKeys(left.key, right.key));
  // Keyset, not offset (K16). The cursor row itself may have left the group
  // between two pages; comparing keys still resumes at the right place, where an
  // index would have shifted the whole tail up by one.
  const remaining = cursor
    ? sorted.filter((entry) => compareGroupMemberSortKeys(entry.key, cursor) > 0)
    : sorted;
  const page = remaining.slice(0, limit);
  const last = page.at(-1);

  // Presence is read for the page, never for the whole roster: a 250-person
  // group would otherwise pay for 250 lookups to draw ten rows.
  const presenceByUserId = await dependencies.readPresence(
    viewerId,
    page.map((entry) => ({
      customStatus: entry.participant.user.customStatus,
      userId: entry.participant.userId,
    })),
    true,
  );

  return {
    items: page.map((entry) =>
      toGroupMemberRow(entry.participant, viewerId, presenceByUserId.get(entry.participant.userId)),
    ),
    nextCursor: remaining.length > page.length && last ? encodeGroupMemberCursor(last.key) : null,
    total: conversation.participants.length,
  };
}

export function toGroupMemberRow(
  participant: GroupProfileParticipantRow,
  viewerId: string,
  presence: GroupProfilePresence | undefined,
): GroupMemberRowDTO {
  const name = toDisplayName(participant.user);

  return {
    initials: toInitials(name),
    isSelf: participant.userId === viewerId,
    // Raw, so the client formats `dün 22:10` in its own locale and timezone.
    lastSeenAt: presence?.lastSeenAt ?? null,
    name,
    // `VisiblePresenceStatus` and `DMPresenceStatus` are the same four values;
    // the rail's mapper is reused rather than copied so one surface can never
    // start calling `IDLE` something the other does not.
    presence: toMessagesPresence(presence?.status ?? "OFFLINE"),
    role: participant.role,
    // The member's own custom status (`Odak modu · 25 dk`), never a sentence
    // built here: `Çevrimdışı · dün 22:10` is assembled by the client from
    // `presence` and `lastSeenAt`, in the reader's language.
    statusText: presence?.customStatus ?? null,
    // K/kural 5: one tint helper for every surface. `DMParticipant.nameColor` is
    // deliberately not used — it is raw hex and scoped to a single group, so the
    // same person would change colour between the rail and this list.
    tint: resolveProfileTint(participant.userId),
    userId: participant.userId,
  };
}
