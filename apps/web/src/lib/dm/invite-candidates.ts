import {
  canMemberDo,
  resolveProfileTint,
  type DMParticipantRole,
  type GroupPermissionLevel,
  type InviteCandidateDTO,
  type InviteCandidatePage,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { toInitials, toMessagesPresence } from "@/lib/messages/rail-presentation";
import { readPresenceState, type VisiblePresenceStatus } from "@/lib/presence";
import {
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
} from "@/lib/privacy/visibility-policy";
import { getRedis } from "@/lib/redis";

/**
 * SPEC-MESAJLAR §16 — the `ARKADAŞLARIN` list behind the add-members modal.
 *
 * Five rules decide who is a candidate, and every one of them runs **here**, on the
 * server:
 *
 * 1. the pool is the viewer's friends (`FriendRequest.status = ACCEPTED`, either
 *    direction) — never "everybody";
 * 2. people already in the group are removed;
 * 3. a friend whose `UserSettings.allowGroupInvites` is off is not a candidate — the
 *    column exists for exactly this switch;
 * 4. a blocked or blocking user is not a candidate;
 * 5. the viewer themself is never in their own list.
 *
 * Filtering **on the client** was the tempting shortcut and it is wrong for a reason
 * that only shows up at scale: with 250 members in a group, a page of 30 friends can
 * come back with two rows left after the filter, then one, then none — the list would
 * stutter, the `{n} eklenebilir` counter would lie, and "load more" would keep
 * fetching pages that render nothing. A page has to mean a page.
 *
 * The whole thing mirrors `group-profile-service.ts`: pure helpers for the rules, an
 * injectable dependency set for the queries, and presence read only for the rows that
 * are actually returned.
 */

/** §16 draws five rows; a page carries enough to fill the list without a second trip. */
export const INVITE_CANDIDATE_PAGE_SIZE = 30;
const INVITE_CANDIDATE_PAGE_MAX = 100;

/**
 * How many friend rows the pool read is willing to materialise. A cap rather than an
 * unbounded `IN (…)`: the sort has to happen in memory (Turkish collation, same as the
 * roster's), and a viewer with a pathological friend count must not turn one modal into
 * a table scan. Nobody reaches it through the UI — the search box narrows the pool long
 * before this.
 */
export const INVITE_CANDIDATE_POOL_MAX = 1000;

export type InviteCandidateParticipantRow = {
  readonly role: DMParticipantRole;
  readonly userId: string;
};

export type InviteCandidateConversationRow = {
  readonly id: string;
  readonly participants: readonly InviteCandidateParticipantRow[];
  readonly permAddMembers: GroupPermissionLevel;
  readonly type: string;
};

export type InviteCandidateUserRow = {
  /** The stored status line, used when Redis has no live record for the friend. */
  readonly customStatus: string | null;
  readonly displayName: string | null;
  readonly userId: string;
  readonly username: string;
};

/** Both verdicts come off the same `FriendRequest` table, so one read answers both. */
export type InviteCandidateRelations = {
  readonly blockedUserIds: readonly string[];
  readonly friendUserIds: readonly string[];
};

export type InviteCandidatePresence = {
  readonly customStatus: string | null;
  readonly status: VisiblePresenceStatus;
};

export type InviteCandidateServiceDependencies = {
  /**
   * Only the ids whose `allowGroupInvites` is **off** come back, so the payload is
   * empty in the normal case — the same shape `loadGroupEligibility` uses.
   */
  listClosedInviteUserIds(userIds: readonly string[]): Promise<readonly string[]>;
  loadConversation(conversationId: string): Promise<InviteCandidateConversationRow | null>;
  loadRelations(viewerId: string): Promise<InviteCandidateRelations>;
  loadUsers(userIds: readonly string[]): Promise<readonly InviteCandidateUserRow[]>;
  readPresence(
    viewerId: string,
    subjects: readonly { customStatus: string | null; userId: string }[],
  ): Promise<Map<string, InviteCandidatePresence>>;
};

const defaults: InviteCandidateServiceDependencies = {
  listClosedInviteUserIds: async (userIds) => {
    if (userIds.length === 0) {
      return [];
    }

    const rows = await prisma.userSettings.findMany({
      select: { userId: true },
      where: { allowGroupInvites: false, userId: { in: [...userIds] } },
    });

    return rows.map((row) => row.userId);
  },
  loadConversation: (conversationId) =>
    prisma.dMConversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        participants: { select: { role: true, userId: true } },
        permAddMembers: true,
        type: true,
      },
    }),
  loadRelations: async (viewerId) => {
    const rows = await prisma.friendRequest.findMany({
      select: { receiverId: true, senderId: true, status: true },
      take: INVITE_CANDIDATE_POOL_MAX,
      where: {
        status: { in: ["ACCEPTED", "BLOCKED"] },
        OR: [{ senderId: viewerId }, { receiverId: viewerId }],
      },
    });

    return toInviteCandidateRelations(viewerId, rows);
  },
  loadUsers: async (userIds) => {
    if (userIds.length === 0) {
      return [];
    }

    const rows = await prisma.user.findMany({
      select: { customStatus: true, displayName: true, id: true, username: true },
      where: { id: { in: [...userIds] } },
    });

    return rows.map((row) => ({
      customStatus: row.customStatus,
      displayName: row.displayName,
      userId: row.id,
      username: row.username,
    }));
  },
  readPresence: async (viewerId, subjects) => {
    const ids = [...new Set(subjects.map((subject) => subject.userId))];

    if (ids.length === 0) {
      return new Map();
    }

    const [presenceState, decisions] = await Promise.all([
      readPresenceState(
        getRedis(),
        subjects.map((subject) => ({
          customStatus: subject.customStatus,
          status: "OFFLINE" as const,
          userId: subject.userId,
        })),
      ),
      resolveVisibilityDecisions(viewerId, ids),
    ]);
    // `lastSeenAt` is deliberately not read: `InviteCandidateDTO` carries no such
    // field, and fetching an activity timestamp nothing renders would hand out the
    // one value the visibility policy exists to protect.
    const redacted = redactPresenceCollectionForViewer({
      decisions,
      invisibleUserIds: presenceState.hiddenUserIds,
      lastSeenByUserId: new Map<string, string | null>(),
      presenceByUserId: presenceState.presenceByUserId,
      subjectIds: ids,
    });

    return new Map(
      ids.map((userId) => [
        userId,
        {
          customStatus: redacted.presenceByUserId.get(userId)?.customStatus ?? null,
          status: redacted.presenceByUserId.get(userId)?.status ?? "OFFLINE",
        },
      ]),
    );
  },
};

/**
 * Rows to verdicts. Split from the query for the same reason `toGroupEligibilityMap`
 * is: this is the half that can be wrong — which end of the row is the other person,
 * and what a pair holding both an ACCEPTED and a BLOCKED row means.
 *
 * A block wins over a friendship in both directions. `FriendRequest.status = BLOCKED`
 * is written by whichever side pressed the button, and the row does not say who; the
 * only safe reading is that the pair is off-limits.
 */
export function toInviteCandidateRelations(
  viewerId: string,
  rows: ReadonlyArray<{ receiverId: string; senderId: string; status: string }>,
): InviteCandidateRelations {
  const friendUserIds = new Set<string>();
  const blockedUserIds = new Set<string>();

  for (const row of rows) {
    const otherId = row.senderId === viewerId ? row.receiverId : row.senderId;

    if (otherId === viewerId) {
      continue;
    }

    if (row.status === "BLOCKED") {
      blockedUserIds.add(otherId);
      continue;
    }

    if (row.status === "ACCEPTED") {
      friendUserIds.add(otherId);
    }
  }

  return { blockedUserIds: [...blockedUserIds], friendUserIds: [...friendUserIds] };
}

/**
 * §16's gate, in the order the tests pin: a stranger is refused before the
 * conversation's type is revealed, and only a participant learns that the id belongs
 * to a 1:1 rather than a group.
 *
 * The last check is the one §16 names: with `permAddMembers: ADMINS` a plain member
 * cannot add anybody, so the candidate list is a 403 rather than an empty list. An
 * empty list would read as "you have no friends left to add", which is a different —
 * and false — sentence.
 */
export function requireInviteCandidateContext(
  conversation: InviteCandidateConversationRow | null,
  viewerId: string,
): { conversation: InviteCandidateConversationRow; viewerRole: DMParticipantRole } {
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

  if (!canMemberDo(viewer.role, conversation.permAddMembers)) {
    throw new ApiError("You do not have permission to do this", 403, "FORBIDDEN");
  }

  return { conversation, viewerRole: viewer.role };
}

/**
 * The five-item rule, as one pure function.
 *
 * Order is not important to the result — every clause removes ids — but it is
 * important to the reader: the pool first, then the four subtractions, so "who can I
 * add" is answerable by reading one expression.
 */
export function selectInviteCandidateIds(input: {
  readonly blockedUserIds: readonly string[];
  readonly closedUserIds: readonly string[];
  readonly friendUserIds: readonly string[];
  readonly memberUserIds: readonly string[];
  readonly viewerId: string;
}): string[] {
  const members = new Set(input.memberUserIds);
  const blocked = new Set(input.blockedUserIds);
  const closed = new Set(input.closedUserIds);

  return [...new Set(input.friendUserIds)].filter(
    (userId) =>
      userId !== input.viewerId &&
      !members.has(userId) &&
      !blocked.has(userId) &&
      !closed.has(userId),
  );
}

/** A person's name as every DM surface already renders it: display name, else handle. */
export function toInviteCandidateName(user: InviteCandidateUserRow): string {
  return user.displayName ?? user.username;
}

/**
 * `Arkadaş ara — isim veya @kullanıcıadı`. Both halves of the placeholder are real:
 * the query matches the display name **and** the handle, and a leading `@` is stripped
 * so typing the handle the way it is printed still finds the person.
 *
 * Folded with the Turkish locale, because `İ`/`ı` are the two letters a naive
 * `toLowerCase()` gets wrong — and they are not rare here.
 */
export function matchesInviteCandidateQuery(user: InviteCandidateUserRow, query: string): boolean {
  const needle = query.trim().replace(/^@+/, "").toLocaleLowerCase("tr");

  if (needle.length === 0) {
    return true;
  }

  return (
    toInviteCandidateName(user).toLocaleLowerCase("tr").includes(needle) ||
    user.username.toLocaleLowerCase("tr").includes(needle)
  );
}

export type InviteCandidateSortKey = {
  readonly name: string;
  readonly userId: string;
};

export function toInviteCandidateSortKey(user: InviteCandidateUserRow): InviteCandidateSortKey {
  return { name: toInviteCandidateName(user), userId: user.userId };
}

/**
 * Name, then id. The id tiebreak is not decoration: two friends sharing a display name
 * would otherwise order differently between two requests, and a cursor built on an
 * unstable order skips or repeats rows.
 */
export function compareInviteCandidateSortKeys(
  left: InviteCandidateSortKey,
  right: InviteCandidateSortKey,
): number {
  const byName = left.name.localeCompare(right.name, "tr");

  return byName !== 0 ? byName : left.userId.localeCompare(right.userId);
}

export function encodeInviteCandidateCursor(key: InviteCandidateSortKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

export function decodeInviteCandidateCursor(
  cursor: string | null | undefined,
): InviteCandidateSortKey | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<InviteCandidateSortKey>;

    if (typeof parsed.name !== "string" || typeof parsed.userId !== "string") {
      return null;
    }

    return { name: parsed.name, userId: parsed.userId };
  } catch {
    // Same reading the roster gives a broken cursor: "start from the beginning",
    // not a 400. It is the client's own opaque token and a stale one must not
    // strand a modal that simply came back from a cache.
    return null;
  }
}

export function normalizeInviteCandidateLimit(limit: number | null | undefined): number {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return INVITE_CANDIDATE_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(limit as number), 1), INVITE_CANDIDATE_PAGE_MAX);
}

export function toInviteCandidateDTO(
  user: InviteCandidateUserRow,
  presence: InviteCandidatePresence | undefined,
): InviteCandidateDTO {
  const name = toInviteCandidateName(user);

  return {
    initials: toInitials(name),
    name,
    presence: toMessagesPresence(presence?.status ?? "OFFLINE"),
    // The friend's own status line (`PUBG oynuyor · 2. sıra`), never a sentence built
    // here — the client writes `Çevrimdışı` in its own language. §16's design also
    // prints last-seen phrasings (`2 saat önce görüldü`); `InviteCandidateDTO` carries
    // no `lastSeenAt`, so the row falls back to the presence label. See `12-rapor.md`.
    statusText: presence?.customStatus ?? null,
    // kural 5: one tint helper for every surface, so the same person is the same
    // colour in the rail, the roster and this list.
    tint: resolveProfileTint(user.userId),
    userId: user.userId,
  };
}

export type ListInviteCandidatesOptions = {
  readonly cursor?: string | null;
  readonly limit?: number | null;
  readonly query?: string | null;
};

/**
 * §16's list. Keyset paging (K16) — `{ items, nextCursor, alreadyMemberCount }`, no
 * offset anywhere.
 *
 * `alreadyMemberCount` is the **group's** member count, which is what §16's stack line
 * prints (`5 kişi zaten üye` under a five-person group). It rides along on this page so
 * the modal's "these people are not in the list" note costs no second request.
 */
export async function listInviteCandidates(
  viewerId: string,
  conversationId: string,
  options: ListInviteCandidatesOptions = {},
  dependencies: InviteCandidateServiceDependencies = defaults,
): Promise<InviteCandidatePage> {
  const { conversation } = requireInviteCandidateContext(
    await dependencies.loadConversation(conversationId),
    viewerId,
  );

  const relations = await dependencies.loadRelations(viewerId);
  const memberUserIds = conversation.participants.map((participant) => participant.userId);
  // The privacy switch is asked about **friends who are otherwise still candidates**,
  // not about the whole pool: a friend already in the group is out either way, and
  // asking about them would widen the read for nothing.
  const shortlist = selectInviteCandidateIds({
    blockedUserIds: relations.blockedUserIds,
    closedUserIds: [],
    friendUserIds: relations.friendUserIds,
    memberUserIds,
    viewerId,
  });
  const closedUserIds = await dependencies.listClosedInviteUserIds(shortlist);
  const candidateIds = selectInviteCandidateIds({
    blockedUserIds: relations.blockedUserIds,
    closedUserIds,
    friendUserIds: shortlist,
    memberUserIds,
    viewerId,
  });

  const limit = normalizeInviteCandidateLimit(options.limit);
  const cursor = decodeInviteCandidateCursor(options.cursor);
  const users = await dependencies.loadUsers(candidateIds);
  const sorted = users
    .filter((user) => matchesInviteCandidateQuery(user, options.query ?? ""))
    .map((user) => ({ key: toInviteCandidateSortKey(user), user }))
    .sort((left, right) => compareInviteCandidateSortKeys(left.key, right.key));
  const remaining = cursor
    ? sorted.filter((entry) => compareInviteCandidateSortKeys(entry.key, cursor) > 0)
    : sorted;
  const page = remaining.slice(0, limit);
  const last = page.at(-1);

  // Presence is read for the page, never for the pool: a viewer with 400 friends
  // would otherwise pay for 400 lookups to draw five rows.
  const presenceByUserId = await dependencies.readPresence(
    viewerId,
    page.map((entry) => ({ customStatus: entry.user.customStatus, userId: entry.user.userId })),
  );

  return {
    alreadyMemberCount: memberUserIds.length,
    items: page.map((entry) =>
      toInviteCandidateDTO(entry.user, presenceByUserId.get(entry.user.userId)),
    ),
    nextCursor:
      remaining.length > page.length && last ? encodeInviteCandidateCursor(last.key) : null,
  };
}
