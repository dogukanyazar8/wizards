import type { PrismaClient } from "@wizards/db";

import { logError } from "@/lib/logger";
import { getRedisOp } from "@/lib/redis";

/**
 * 6d's "Bu hafta" statistic: messages posted in this server's channels over
 * the last seven days.
 *
 * Cached in Redis rather than computed per profile open — the same shape
 * `badge-rarity.ts` already uses for a derived number that is expensive
 * relative to how fast it moves. `message.count` is the only query on the
 * profile route that scales with the server's data volume, so the cold path is
 * also single-flighted: one caller recomputes while everyone else keeps
 * reading the previous number.
 *
 * The count itself is served by the existing `Message[channelId, createdAt]`
 * index; no new index was needed.
 */
export const SERVER_WEEKLY_MESSAGE_COUNT_TTL_SECONDS = 15 * 60;

/**
 * How long a cached number keeps being served *after* it goes stale, while the
 * single winner recomputes it. Three refresh windows, so a recompute that keeps
 * failing degrades to "—" instead of serving a number from an hour ago forever.
 */
export const SERVER_WEEKLY_MESSAGE_COUNT_RETENTION_SECONDS =
  SERVER_WEEKLY_MESSAGE_COUNT_TTL_SECONDS * 3;

/** Long enough to cover the count, short enough that a crashed holder is not missed. */
export const SERVER_WEEKLY_MESSAGE_COUNT_LOCK_SECONDS = 30;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function serverWeeklyMessageCountCacheKey(serverId: string): string {
  return `server:${serverId}:weekly-messages:v2`;
}

export function serverWeeklyMessageCountLockKey(serverId: string): string {
  return `server:${serverId}:weekly-messages:lock:v2`;
}

export type ServerWeeklyMessageCountCache = {
  /** `SET key value NX EX ttl` — true only for the caller that took the lock. */
  acquireLock: (key: string, ttlSeconds: number) => Promise<boolean>;
  read: (key: string) => Promise<string | null>;
  write: (key: string, payload: string, ttlSeconds: number) => Promise<void>;
};

const defaultCache: ServerWeeklyMessageCountCache = {
  acquireLock: async (key, ttlSeconds) =>
    (await getRedisOp().set(key, "1", "EX", ttlSeconds, "NX")) === "OK",
  read: (key) => getRedisOp().get(key),
  write: async (key, payload, ttlSeconds) => {
    await getRedisOp().set(key, payload, "EX", ttlSeconds);
  },
};

/**
 * Same seam as `setOnlineServerMemberCountRedisForTest`: the profile read
 * reaches this through its own module rather than through an argument, so a
 * test that wants a cold cache has to be able to say so. Without it a local
 * Redis makes the profile's query count depend on whether an earlier test
 * already warmed the key.
 */
let cacheOverride: ServerWeeklyMessageCountCache | null = null;

export function setServerWeeklyMessageCountCacheForTest(
  cache: ServerWeeklyMessageCountCache | null,
): void {
  cacheOverride = cache;
}

export type ServerWeeklyMessageCountEntry = {
  readonly computedAtMs: number;
  readonly count: number;
};

/** Stored as `<count>:<computedAtMs>` so freshness is a property of the value. */
export function serializeServerWeeklyMessageCount(entry: ServerWeeklyMessageCountEntry): string {
  return `${entry.count}:${entry.computedAtMs}`;
}

export function parseServerWeeklyMessageCount(
  payload: string | null,
): ServerWeeklyMessageCountEntry | null {
  if (payload === null) {
    return null;
  }

  const [rawCount, rawComputedAt] = payload.split(":");
  const count = Number.parseInt(rawCount ?? "", 10);
  const computedAtMs = Number.parseInt(rawComputedAt ?? "", 10);

  if (!Number.isInteger(count) || count < 0 || !Number.isInteger(computedAtMs)) {
    return null;
  }

  return { computedAtMs, count };
}

export function isServerWeeklyMessageCountFresh(
  entry: ServerWeeklyMessageCountEntry,
  nowMs: number,
): boolean {
  const ageMs = nowMs - entry.computedAtMs;
  return ageMs >= 0 && ageMs < SERVER_WEEKLY_MESSAGE_COUNT_TTL_SECONDS * 1_000;
}

/**
 * Returns `null` rather than throwing when the count cannot be produced: 6d
 * renders "—" in that cell, and a statistic must never be able to take the
 * whole profile route down with it.
 */
export async function getServerWeeklyMessageCount(
  database: Pick<PrismaClient, "message">,
  serverId: string,
  cache: ServerWeeklyMessageCountCache = cacheOverride ?? defaultCache,
  now: Date = new Date(),
): Promise<number | null> {
  const key = serverWeeklyMessageCountCacheKey(serverId);
  const nowMs = now.getTime();
  let cached: ServerWeeklyMessageCountEntry | null = null;

  try {
    cached = parseServerWeeklyMessageCount(await cache.read(key));
    if (cached !== null && isServerWeeklyMessageCountFresh(cached, nowMs)) {
      return cached.count;
    }
  } catch (error) {
    logError("[server-weekly-message-count] cache read failed", error);
  }

  // Single-flight: whoever takes the lock pays for the count, everyone else
  // keeps serving the previous number until it lands. A crowded server would
  // otherwise send every concurrent profile open into the same slow aggregate
  // the moment the key expires.
  let holdsLock = true;
  try {
    holdsLock = await cache.acquireLock(
      serverWeeklyMessageCountLockKey(serverId),
      SERVER_WEEKLY_MESSAGE_COUNT_LOCK_SECONDS,
    );
  } catch (error) {
    logError("[server-weekly-message-count] lock failed", error);
  }

  if (!holdsLock) {
    return cached?.count ?? null;
  }

  let count: number;
  try {
    count = await database.message.count({
      where: {
        channel: { serverId },
        createdAt: { gte: new Date(nowMs - WEEK_MS) },
        deletedAt: null,
      },
    });
  } catch (error) {
    logError("[server-weekly-message-count] count failed", error);
    return cached?.count ?? null;
  }

  try {
    await cache.write(
      key,
      serializeServerWeeklyMessageCount({ computedAtMs: nowMs, count }),
      SERVER_WEEKLY_MESSAGE_COUNT_RETENTION_SECONDS,
    );
  } catch (error) {
    logError("[server-weekly-message-count] cache write failed", error);
  }

  return count;
}
