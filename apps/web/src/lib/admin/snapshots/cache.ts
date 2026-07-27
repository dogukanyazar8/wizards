const DEFAULT_SNAPSHOT_CACHE_TTL_MS = 15_000;

type SnapshotCacheEntry = {
  expiresAt: number;
  promise: Promise<unknown>;
};

/**
 * One process-wide map keyed by `${loader}:${days}` so each admin module keeps
 * its own short-lived entry instead of sharing the single dashboard blob.
 */
const snapshotCache = new Map<string, SnapshotCacheEntry>();

export function getSnapshotCacheTtlMs() {
  const rawValue = process.env.WHISPR_ADMIN_DASHBOARD_CACHE_MS;
  if (!rawValue) {
    return DEFAULT_SNAPSHOT_CACHE_TTL_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SNAPSHOT_CACHE_TTL_MS;
}

export function resetAdminSnapshotCacheForTests() {
  snapshotCache.clear();
}

export function withSnapshotCache<T>(cacheKey: string, load: () => Promise<T>): Promise<T> {
  const cacheTtlMs = getSnapshotCacheTtlMs();

  if (cacheTtlMs <= 0) {
    return load();
  }

  const nowMs = Date.now();
  const cached = snapshotCache.get(cacheKey);

  if (cached && cached.expiresAt > nowMs) {
    return cached.promise as Promise<T>;
  }

  const promise = load().catch((error: unknown) => {
    const current = snapshotCache.get(cacheKey);
    if (current?.promise === promise) {
      snapshotCache.delete(cacheKey);
    }

    throw error;
  });

  snapshotCache.set(cacheKey, {
    expiresAt: nowMs + cacheTtlMs,
    promise,
  });

  return promise;
}
