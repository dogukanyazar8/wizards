import type Redis from "ioredis";

/**
 * `fetchSockets()` serialises every socket in a room just to count the distinct
 * users behind them. A twelve-thousand-member community server makes that
 * expensive, and a discovery list would repeat it once per server. A Redis set
 * answers the same question with one `SCARD`.
 *
 * The set is derived state, not a record of truth: if Redis loses it, sockets
 * repopulate it as they reconnect. The TTL keeps an abandoned key from
 * outliving the process that wrote it. Because it is derived, the write
 * helpers below are non-throwing by design (readiness guard + try/catch,
 * mirroring the idiom in server-room-cache.ts): a failed write just degrades
 * the count until the next join/disconnect/presence event repopulates it, and
 * must never break the caller.
 */
const ONLINE_SET_TTL_SECONDS = 60 * 60 * 12;

export type ServerOnlinePresenceRedis = {
  expire: (key: string, seconds: number) => Promise<unknown>;
  sadd: (key: string, member: string) => Promise<unknown>;
  scard: (key: string) => Promise<number>;
  smismember: (key: string, ...members: string[]) => Promise<number[]>;
  srem: (key: string, member: string) => Promise<unknown>;
  status: Redis["status"];
};

export function buildServerOnlineKey(serverId: string): string {
  return `server:${serverId}:online`;
}

function isServerOnlinePresenceRedisReady(redis: ServerOnlinePresenceRedis) {
  return redis.status === "ready";
}

export async function addServerOnlineMember(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
  userId: string,
): Promise<void> {
  if (!isServerOnlinePresenceRedisReady(redis)) {
    return;
  }

  const key = buildServerOnlineKey(serverId);
  try {
    await redis.sadd(key, userId);
    await redis.expire(key, ONLINE_SET_TTL_SECONDS);
  } catch {
    // Derived state: see the module docstring above.
  }
}

export async function removeServerOnlineMember(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
  userId: string,
): Promise<void> {
  if (!isServerOnlinePresenceRedisReady(redis)) {
    return;
  }

  try {
    await redis.srem(buildServerOnlineKey(serverId), userId);
  } catch {
    // Derived state: see the module docstring above.
  }
}

export async function countServerOnlineMembers(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
): Promise<number> {
  return redis.scard(buildServerOnlineKey(serverId));
}

/**
 * Which of these users are in the same `server:<id>:online` set the count comes
 * from. The profile screen prints "N çevrimiçi" and a per-admin presence dot on
 * the same card; sourcing the dot from `AppSession.lastSeenAt` instead let the
 * two contradict each other ("3 çevrimiçi" over an all-offline admin list).
 *
 * One `SMISMEMBER` for the whole (capped) admin list, and fails open exactly
 * like `getOnlineServerMemberCount`: a not-ready or erroring Redis reports
 * nobody online, which is the same answer the count degrades to. Consistently
 * wrong beats mutually contradictory.
 */
export async function readServerOnlineMembers(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
  userIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (userIds.length === 0 || redis.status !== "ready") {
    return new Set();
  }

  try {
    const flags = await redis.smismember(buildServerOnlineKey(serverId), ...userIds);

    return new Set(userIds.filter((_userId, index) => flags[index] === 1));
  } catch {
    return new Set();
  }
}

export type ServerOnlinePresencePipeline = {
  exec(): Promise<ReadonlyArray<readonly [Error | null, unknown]> | null>;
  scard(key: string): ServerOnlinePresencePipeline;
};

export type ServerOnlinePresenceBatchRedis = {
  pipeline: () => ServerOnlinePresencePipeline;
  status: Redis["status"];
};

/**
 * The discovery list needs an online count per card, N servers to a page.
 * N round trips of `SCARD` would repeat per-command latency N times over;
 * one pipeline answers them all in a single round trip.
 *
 * Reads the exact same `server:<id>:online` sets `countServerOnlineMembers`
 * does, through the same `buildServerOnlineKey` -- so a server's count here
 * can never drift from what a direct `countServerOnlineMembers` call for
 * that same id would return. Same source, two call shapes.
 *
 * Unlike the raw single-key primitives above, this fails open by design
 * (not-ready or erroring redis degrades every requested count to 0) rather
 * than throwing: a discovery page is a browse surface, and one stalled
 * pipeline must not 500 the whole list over what is, by design, best-effort
 * derived state -- the same tradeoff `getOnlineServerMemberCount` already
 * makes for the single-server read in unread-service.ts.
 */
export async function countServerOnlineMembersBatch(
  redis: ServerOnlinePresenceBatchRedis,
  serverIds: readonly string[],
): Promise<Map<string, number>> {
  if (serverIds.length === 0) {
    return new Map();
  }

  if (redis.status !== "ready") {
    return new Map(serverIds.map((serverId) => [serverId, 0]));
  }

  try {
    let pipeline = redis.pipeline();
    for (const serverId of serverIds) {
      pipeline = pipeline.scard(buildServerOnlineKey(serverId));
    }
    const results = await pipeline.exec();

    return new Map(
      serverIds.map((serverId, index) => {
        const entry = results?.[index];
        const count = entry && !entry[0] && typeof entry[1] === "number" ? entry[1] : 0;
        return [serverId, count];
      }),
    );
  } catch {
    return new Map(serverIds.map((serverId) => [serverId, 0]));
  }
}

export type OnlinePresenceSocket = {
  connected?: boolean;
  data: {
    onlineServerIds?: string[];
    presenceStatus?: string;
  };
};

/**
 * Whether a socket should currently be marked online in any server's set.
 *
 * Two independent, fire-and-forget chains write this socket's online-presence
 * membership starting in the same synchronous tick of the `connection`
 * callback: `joinServerRoomsForUser` (presence-blind: it knows which servers,
 * not the user's presence) and `initializePresence` (presence-aware: it knows
 * the presence, not necessarily the servers yet). Neither has an ordering
 * guarantee over the other, and a disconnect can also resolve before either
 * finishes. Gating every add through this single predicate, checked at
 * write-time rather than decided ahead of time, is what makes the outcome
 * order-independent: whichever of the racing writers runs last always reads
 * the other's already-written field (both chains go through
 * `applyServerOnlinePresenceForSocket` below — server.ts's
 * `joinServerRoomsForUser` and presence.ts's `initializePresence` /
 * `presence:activity` — see the Task 8 review notes for the ordering
 * argument).
 *
 * `connected` defaults to eligible (only `false` excludes) so the minimal
 * socket doubles used in tests, which don't model disconnection, keep working
 * unchanged. `presenceStatus` also defaults to eligible when unset, because
 * `assignSocketUserData` (server.ts) always sets a real socket's status to
 * "OFFLINE" before any handler runs -- that default is what actually gates a
 * not-yet-initialized socket out, not an absent field here.
 */
export function isSocketEligibleForOnlinePresence(socket: OnlinePresenceSocket): boolean {
  return socket.connected !== false && socket.data.presenceStatus !== "OFFLINE";
}

/**
 * Brings the online sets of every server this socket is in back in line with
 * the socket's current eligibility. The single writer for both racing chains.
 *
 * `socket.data.onlineServerIds` is the source of the server list rather than
 * an argument, so a concurrent `detachUserFromServerSocketRoom` (kick/leave)
 * that already pruned that list cannot be undone by an add that was decided
 * against a stale copy of it.
 *
 * The eligibility re-check after the adds is what closes the window the checks
 * alone leave open: a disconnect, or an OFFLINE presence transition, can
 * resolve while the adds are in flight. Reversing on a flip makes the outcome
 * the same no matter which chain finishes last.
 */
export async function applyServerOnlinePresenceForSocket(
  redis: ServerOnlinePresenceRedis,
  socket: OnlinePresenceSocket,
  userId: string,
): Promise<void> {
  const serverIds = socket.data.onlineServerIds ?? [];
  if (serverIds.length === 0) {
    return;
  }

  const removeAll = () =>
    Promise.all(serverIds.map((serverId) => removeServerOnlineMember(redis, serverId, userId)));

  if (!isSocketEligibleForOnlinePresence(socket)) {
    await removeAll();
    return;
  }

  await Promise.all(serverIds.map((serverId) => addServerOnlineMember(redis, serverId, userId)));

  if (!isSocketEligibleForOnlinePresence(socket)) {
    await removeAll();
  }
}
