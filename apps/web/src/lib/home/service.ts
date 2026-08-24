import { ChannelType, prisma, type PrismaClient } from "@wizards/db";

import { readPresenceState } from "@/lib/presence";
import {
  redactPresenceCollectionForViewer,
  resolveVisibilityDecisions,
} from "@/lib/privacy/visibility-policy";
import { getRedis } from "@/lib/redis";
import { listChannelIdsByServerForUserWithPermission } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";

import type { HomeActor, HomePresence } from "./types";

/**
 * Ana Sayfa 1a — Faz 3. Pieces every home endpoint shares.
 *
 * Two rules live here rather than in each endpoint:
 *
 * 1. **Authorization is a query filter, not a post-filter.** Every list is built
 *    from `listVisibleChannelIds`, which resolves per-channel `VIEW_CHANNEL`
 *    through the existing permission service. A channel the viewer cannot read
 *    never reaches the SQL that produces the payload.
 * 2. **Presence is redacted once, centrally.** `readHomePresence` runs every
 *    subject through `redactPresenceCollectionForViewer`, so an invisible user
 *    reads as OFFLINE on every card. Home DTOs carry no last-seen field at all,
 *    so that channel cannot leak either.
 */

export const HOME_ACTOR_SELECT = {
  avatarUrl: true,
  displayName: true,
  id: true,
  username: true,
} as const;

export type HomeActorSource = {
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly id: string;
  readonly username: string;
};

export function toHomeActor(
  user: HomeActorSource,
  presenceByUserId?: ReadonlyMap<string, HomePresence>,
): HomeActor {
  return {
    avatarUrl: user.avatarUrl,
    displayName: user.displayName ?? user.username,
    id: user.id,
    presence: presenceByUserId?.get(user.id) ?? "OFFLINE",
  };
}

export type HomePresenceReader = (
  viewerId: string,
  subjectIds: readonly string[],
) => Promise<Map<string, HomePresence>>;

/**
 * Presence **plus** the set the redaction hid from this viewer.
 *
 * A dot only needs the status, so most cards keep using `readHomePresence`. A
 * surface that also renders *where somebody is* — the live rooms card — needs
 * the set itself: an invisible user reads OFFLINE, and rendering them as a room
 * participant would restate the very thing the mode hides. `friends/queries.ts`
 * already drops a friend's voice room on the same set.
 */
export type HomePresenceState = {
  readonly hiddenUserIds: ReadonlySet<string>;
  readonly presenceByUserId: ReadonlyMap<string, HomePresence>;
};

export type HomePresenceStateReader = (
  viewerId: string,
  subjectIds: readonly string[],
) => Promise<HomePresenceState>;

/**
 * The only way a home payload learns somebody else's presence.
 *
 * Costs two Redis pipelines plus the visibility policy's own two reads; those
 * are shared services with their own budgets and are counted separately from an
 * endpoint's SQL budget.
 */
export async function readHomePresence(
  viewerId: string,
  subjectIds: readonly string[],
): Promise<Map<string, HomePresence>> {
  const state = await readHomePresenceState(viewerId, subjectIds);

  return new Map(state.presenceByUserId);
}

export async function readHomePresenceState(
  viewerId: string,
  subjectIds: readonly string[],
): Promise<HomePresenceState> {
  const ids = [...new Set(subjectIds.filter(Boolean))];
  if (ids.length === 0) {
    return { hiddenUserIds: new Set(), presenceByUserId: new Map() };
  }

  const [presenceState, decisions] = await Promise.all([
    readPresenceState(
      getRedis(),
      ids.map((userId) => ({ customStatus: null, status: "OFFLINE" as const, userId })),
    ),
    resolveVisibilityDecisions(viewerId, ids),
  ]);

  const redacted = redactPresenceCollectionForViewer({
    decisions,
    invisibleUserIds: presenceState.hiddenUserIds,
    // Home never renders last-seen. Passing an empty map keeps the redaction
    // contract intact without inventing a value the payload cannot carry.
    lastSeenByUserId: new Map(),
    presenceByUserId: presenceState.presenceByUserId,
    subjectIds: ids,
  });

  return {
    hiddenUserIds: redacted.hiddenUserIds,
    presenceByUserId: new Map(
      [...redacted.presenceByUserId.entries()].map(([userId, presence]) => [
        userId,
        presence.status,
      ]),
    ),
  };
}

export type HomeVisibleChannels = {
  readonly all: readonly string[];
  readonly byServer: ReadonlyMap<string, readonly string[]>;
};

/**
 * Injected rather than imported at every call site so an endpoint's own query
 * budget can be measured without the permission service's cached reads mixed in.
 */
export type VisibleChannelResolver = (
  userId: string,
  serverIds: readonly string[],
  type: ChannelType,
) => Promise<ReadonlyMap<string, readonly string[]>>;

export const defaultVisibleChannelResolver: VisibleChannelResolver = (userId, serverIds, type) =>
  listChannelIdsByServerForUserWithPermission(
    userId,
    [...serverIds],
    PermissionBits.VIEW_CHANNEL,
    type,
  );

export async function listViewerServerIds(
  database: PrismaClient,
  userId: string,
): Promise<string[]> {
  const memberships = await database.serverMember.findMany({
    select: { serverId: true },
    where: { userId },
  });

  return memberships.map((membership) => membership.serverId);
}

/**
 * Visible channels of one type across every server the viewer belongs to.
 *
 * Delegates to the cached permission service rather than re-deriving overrides:
 * duplicating that logic is how a "hidden" channel eventually stops being
 * hidden on one surface only.
 */
export async function listVisibleChannelIds(
  userId: string,
  serverIds: readonly string[],
  type: ChannelType,
  resolve: VisibleChannelResolver = defaultVisibleChannelResolver,
): Promise<HomeVisibleChannels> {
  if (serverIds.length === 0) {
    return { all: [], byServer: new Map() };
  }

  const byServer = await resolve(userId, serverIds, type);

  return { all: [...byServer.values()].flat(), byServer };
}

export type HomeChannelAccess = {
  readonly serverIds: readonly string[];
  readonly textChannelIds: readonly string[];
};

/**
 * Server membership plus visible text channels — the pair `app/recent`,
 * `app/awaiting`, `mentions` and `search/command` all start from.
 */
export async function resolveHomeChannelAccess(
  database: PrismaClient,
  userId: string,
  resolve: VisibleChannelResolver = defaultVisibleChannelResolver,
): Promise<HomeChannelAccess> {
  const serverIds = await listViewerServerIds(database, userId);
  const visible = await listVisibleChannelIds(userId, serverIds, ChannelType.TEXT, resolve);

  return { serverIds, textChannelIds: visible.all };
}

export function getHomeDatabase(): PrismaClient {
  return prisma;
}
