import { randomUUID } from "node:crypto";

import { prisma } from "@wizards/db";

import { logError as logErrorDefault } from "@/lib/logger";
import { getRedisOp } from "@/lib/redis";
import { getSocketServer } from "@/lib/socket/runtime";

import {
  defaultDisappearingPurgeDependencies,
  purgeExpiredDMMessages,
} from "./disappearing-service";
import type { GroupRealtimeServer } from "./group-realtime";

/**
 * Grup sohbetleri 2a–2f, Faz 2 §C3. Same shape as `startOutboxWorker`: one
 * interval per process, `unref`'d so it never holds the event loop open, and a
 * single in-flight run guarded by a promise.
 *
 * What is different is the lock. The outbox leases its rows in the database;
 * this sweep deletes by primary key with no row to lease, so every replica would
 * happily purge the same batch. A short Redis lock makes exactly one instance
 * per tick do the work — chosen over `SKIP LOCKED` because the sweep is a
 * `deleteMany`, not a row-by-row claim, and Redis is already a hard dependency
 * of the socket layer this worker emits through.
 */

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 500;

export const DISAPPEARING_LOCK_KEY = "dm:disappearing:sweep";

/**
 * Deliberately shorter than the interval: a replica that dies mid-sweep must
 * have its lock forgotten before the next tick, or the feature silently stops.
 */
export const DISAPPEARING_LOCK_TTL_MS = 55_000;

/**
 * Releases only a lock this process still owns. Without the compare, a sweep
 * that overran its TTL would delete the lock a *different* instance had already
 * taken, and two replicas would purge concurrently.
 */
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export type DisappearingSweepDependencies = {
  /** Resolves to an ownership token, or null when somebody else holds the lock. */
  acquireLock(ttlMs: number): Promise<string | null>;
  logError(message: string, error: unknown): void;
  purge(options: { limit: number }): Promise<{ deleted: number }>;
  releaseLock(token: string): Promise<void>;
};

const sweepDefaults: DisappearingSweepDependencies = {
  acquireLock: async (ttlMs) => {
    const token = randomUUID();
    const result = await getRedisOp().set(DISAPPEARING_LOCK_KEY, token, "PX", ttlMs, "NX");

    return result === "OK" ? token : null;
  },
  logError: logErrorDefault,
  purge: (options) =>
    purgeExpiredDMMessages(options, {
      ...defaultDisappearingPurgeDependencies,
      ...purgeRuntimeDependencies(),
    }),
  releaseLock: async (token) => {
    await getRedisOp().eval(RELEASE_LOCK_SCRIPT, 1, DISAPPEARING_LOCK_KEY, token);
  },
};

/**
 * The two realtime emitters the purge needs, resolved per run: the socket server
 * is created after this module loads, so binding them once at import time would
 * capture a null.
 */
function purgeRuntimeDependencies() {
  // Same structural type `group-realtime.ts` uses: the sweep only needs "emit to
  // a room", and depending on the full server type would drag Socket.IO's event
  // map into a module the tests drive with a plain object.
  const io = getSocketServer() as GroupRealtimeServer | null;

  return {
    emitExpired: ({
      conversationId,
      messageIds,
    }: {
      conversationId: string;
      messageIds: string[];
    }) => {
      if (!io) {
        return;
      }

      // Same room the ordinary removal uses, so a client needs one listener.
      io.to(`dm:${conversationId}`).emit("dm:message:expired", { conversationId, messageIds });

      // …and everyone else, because the people who matter here are usually *not*
      // in the room: a client sitting on the inbox holds the expired message as
      // its conversation preview and has no other reason to hear about it. Not
      // awaited — the rows are already gone, and the sweep must not wait on a
      // roster read to finish its batch.
      void prisma.dMParticipant
        .findMany({ where: { conversationId }, select: { userId: true } })
        .then((participants) => {
          for (const participant of participants) {
            io.to(`user:${participant.userId}`).emit("dm:message:expired", {
              conversationId,
              messageIds,
            });
          }
        })
        .catch((error: unknown) => {
          logErrorDefault("[dm] Disappearing expiry fan-out failed", error);
        });
    },
    emitUnpinned: ({ conversationId }: { conversationId: string }) => {
      // The FK already cleared `pinnedMessageId`; this is what closes the strip
      // on the clients that still have it open.
      io?.to(`dm:${conversationId}`).emit("dm:group:pin", { conversationId, pinnedMessage: null });
    },
  };
}

/**
 * One tick. Extracted from the timer so the lock discipline is testable: the
 * lock is always released, including when the purge throws, and a Redis outage
 * skips the tick instead of taking the worker down.
 */
export async function runDisappearingSweep(
  options: { limit: number },
  dependencies: DisappearingSweepDependencies = sweepDefaults,
): Promise<{ deleted: number; skipped: boolean }> {
  let token: string | null = null;

  try {
    token = await dependencies.acquireLock(DISAPPEARING_LOCK_TTL_MS);
  } catch (error) {
    dependencies.logError("[dm] Disappearing sweep could not reach the lock", error);
    return { deleted: 0, skipped: true };
  }

  if (!token) {
    return { deleted: 0, skipped: true };
  }

  let deleted = 0;

  try {
    ({ deleted } = await dependencies.purge(options));
  } catch (error) {
    // One bad batch must not stop the worker; the same rows are still due on the
    // next tick.
    dependencies.logError("[dm] Disappearing sweep failed", error);
  }

  try {
    await dependencies.releaseLock(token);
  } catch (error) {
    // The TTL cleans up after us. Failing the whole sweep over this would turn a
    // successful purge into an error every minute.
    dependencies.logError("[dm] Disappearing sweep could not release the lock", error);
  }

  return { deleted, skipped: false };
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let currentSweep: Promise<unknown> | null = null;

type StartDisappearingWorkerOptions = {
  batchSize?: number;
  intervalMs?: number;
  keepAlive?: boolean;
  runImmediately?: boolean;
  sweep?: typeof runDisappearingSweep;
};

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function startDisappearingMessageWorker({
  batchSize,
  intervalMs,
  keepAlive = false,
  runImmediately = true,
  sweep = runDisappearingSweep,
}: StartDisappearingWorkerOptions = {}) {
  if (workerTimer || process.env.WHISPR_DISAPPEARING_WORKER === "false") {
    return false;
  }

  const limit =
    batchSize ?? readPositiveIntegerEnv("WHISPR_DISAPPEARING_BATCH_SIZE", DEFAULT_BATCH_SIZE);
  const tickMs =
    intervalMs ?? readPositiveIntegerEnv("WHISPR_DISAPPEARING_INTERVAL_MS", DEFAULT_INTERVAL_MS);

  const tick = () => {
    // A slow sweep must not stack: the next tick finds this still set and skips.
    if (currentSweep) {
      return;
    }

    currentSweep = sweep({ limit }).finally(() => {
      currentSweep = null;
    });
  };

  if (runImmediately) {
    tick();
  }

  workerTimer = setInterval(tick, tickMs);
  if (!keepAlive) {
    workerTimer.unref?.();
  }

  return true;
}

export async function stopDisappearingMessageWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  const sweep = currentSweep;
  if (sweep) {
    await sweep;
  }
}
