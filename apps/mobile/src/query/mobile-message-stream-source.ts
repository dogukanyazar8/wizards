import type { MobileMessageStoreScope } from "../storage/mobile-message-store";

/**
 * Where the first screenful of a chat open came from.
 *
 * "Cached" was one bit, and one bit could not tell a conversation the reader had
 * open a minute ago from one restored off an encrypted page written yesterday —
 * yet those are different budgets, different code paths, and only one of them is
 * the thing this wave built. The panel reports the four apart.
 *
 * `memory` is the query cache; `sqlcipher` is the encrypted page store;
 * `prefetch` is a speculative read that had settled before the tap; `network` is
 * an open with nothing local behind it.
 */
export type MobileMessageStreamSource = "memory" | "network" | "prefetch" | "sqlcipher";

/** Cheapest first, which is also the order the panel reads best in. */
export const MOBILE_MESSAGE_STREAM_SOURCES: readonly MobileMessageStreamSource[] = [
  "memory",
  "sqlcipher",
  "prefetch",
  "network",
];

export type MobileMessageStreamOpenSource = {
  /** How stale the local page was at the moment it became the open, or `null`. */
  readonly cacheAgeMs: number | null;
  readonly source: MobileMessageStreamSource;
};

type MobileMessageStreamOrigin = {
  readonly atMs: number;
  readonly source: "prefetch" | "sqlcipher";
};

/**
 * Bounded by what the encrypted store itself keeps, per scope, twice over — the
 * registry must never be the reason a long session grows.
 */
const MOBILE_MESSAGE_STREAM_ORIGIN_CAP = 32;

const origins = new Map<string, MobileMessageStreamOrigin>();

function originKey(scope: MobileMessageStoreScope, targetId: string): string {
  return `${scope}:${targetId}`;
}

function remember(key: string, origin: MobileMessageStreamOrigin): void {
  // Re-inserting moves the key to the end of the insertion order, so the entry
  // dropped below is the least recently established one.
  origins.delete(key);
  origins.set(key, origin);
  while (origins.size > MOBILE_MESSAGE_STREAM_ORIGIN_CAP) {
    const oldest = origins.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    origins.delete(oldest);
  }
}

/** The stream was seeded from the encrypted page store, written at `storedAtMs`. */
export function markMobileMessageStreamRestored(
  scope: MobileMessageStoreScope,
  targetId: string,
  storedAtMs: number,
): void {
  if (targetId.length === 0) {
    return;
  }

  remember(originKey(scope, targetId), { atMs: storedAtMs, source: "sqlcipher" });
}

/** A speculative network read settled, so the next open pays nothing for it. */
export function markMobileMessageStreamPrefetched(
  scope: MobileMessageStoreScope,
  targetId: string,
  atMs: number = Date.now(),
): void {
  if (targetId.length === 0) {
    return;
  }

  remember(originKey(scope, targetId), { atMs, source: "prefetch" });
}

/** A fetch the reader waited for replaces whatever put the page there before. */
export function forgetMobileMessageStreamOrigin(
  scope: MobileMessageStoreScope,
  targetId: string,
): void {
  origins.delete(originKey(scope, targetId));
}

export function resolveMobileMessageStreamOpenSource(input: {
  /** When the cached stream was last written, or `null` when nothing is cached. */
  readonly dataUpdatedAtMs: number | null;
  readonly now?: number;
  readonly scope: MobileMessageStoreScope;
  readonly targetId: string;
}): MobileMessageStreamOpenSource {
  if (input.dataUpdatedAtMs === null) {
    // No flag means network: it is the bucket that must not flatter itself.
    return { cacheAgeMs: null, source: "network" };
  }

  const origin = origins.get(originKey(input.scope, input.targetId));
  // A page written after the restore or the warm is no longer either of them —
  // the network answered, or the socket patched it, and claiming otherwise would
  // credit this wave with opens it had nothing to do with.
  if (!origin || origin.atMs < input.dataUpdatedAtMs) {
    return { cacheAgeMs: null, source: "memory" };
  }

  const now = input.now ?? Date.now();
  return { cacheAgeMs: Math.max(0, Math.round(now - origin.atMs)), source: origin.source };
}

export function resetMobileMessageStreamSourcesForTests(): void {
  origins.clear();
}
