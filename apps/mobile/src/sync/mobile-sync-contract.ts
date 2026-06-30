export const MOBILE_SYNC_STALE_MS = 60_000;
export const MOBILE_SYNC_FOREGROUND_REFRESH_MS = 30_000;

export type MobileSyncSource = "bootstrap" | "channel" | "dm" | "workspace";

export type MobileSyncStatus = "error" | "idle" | "ready" | "syncing";

export type MobileSyncSnapshot = {
  failureCount: number;
  lastCompletedAt: number | null;
  lastFailedAt: number | null;
  lastStartedAt: number | null;
  source: MobileSyncSource;
  status: MobileSyncStatus;
};

export type MobileSyncAge =
  | { kind: "minutes"; value: number }
  | { kind: "never"; value: null }
  | { kind: "now"; value: 0 }
  | { kind: "seconds"; value: number };

export function createInitialMobileSyncSnapshot(
  source: MobileSyncSource,
): MobileSyncSnapshot {
  return {
    failureCount: 0,
    lastCompletedAt: null,
    lastFailedAt: null,
    lastStartedAt: null,
    source,
    status: "idle",
  };
}

export function markMobileSyncStarted(
  snapshot: MobileSyncSnapshot,
  now = Date.now(),
): MobileSyncSnapshot {
  return {
    ...snapshot,
    lastStartedAt: now,
    status: "syncing",
  };
}

export function markMobileSyncSucceeded(
  snapshot: MobileSyncSnapshot,
  now = Date.now(),
): MobileSyncSnapshot {
  return {
    ...snapshot,
    failureCount: 0,
    lastCompletedAt: now,
    status: "ready",
  };
}

export function markMobileSyncFailed(
  snapshot: MobileSyncSnapshot,
  now = Date.now(),
): MobileSyncSnapshot {
  return {
    ...snapshot,
    failureCount: snapshot.failureCount + 1,
    lastFailedAt: now,
    status: "error",
  };
}

export function isMobileSyncStale(
  snapshot: MobileSyncSnapshot,
  now = Date.now(),
  staleMs = MOBILE_SYNC_STALE_MS,
): boolean {
  if (snapshot.status === "syncing") {
    return false;
  }

  if (!snapshot.lastCompletedAt) {
    return true;
  }

  return now - snapshot.lastCompletedAt >= staleMs;
}

export function shouldRefreshOnForeground(
  snapshot: MobileSyncSnapshot,
  now = Date.now(),
  minIntervalMs = MOBILE_SYNC_FOREGROUND_REFRESH_MS,
): boolean {
  if (snapshot.status === "syncing") {
    return false;
  }

  const lastAttemptAt = Math.max(
    snapshot.lastCompletedAt ?? 0,
    snapshot.lastFailedAt ?? 0,
    snapshot.lastStartedAt ?? 0,
  );

  if (!lastAttemptAt) {
    return true;
  }

  return now - lastAttemptAt >= minIntervalMs;
}

export function formatMobileSyncAge(
  lastCompletedAt: number | null,
  now = Date.now(),
): MobileSyncAge {
  if (!lastCompletedAt) {
    return { kind: "never", value: null };
  }

  const ageSeconds = Math.max(0, Math.floor((now - lastCompletedAt) / 1000));

  if (ageSeconds < 5) {
    return { kind: "now", value: 0 };
  }

  if (ageSeconds < 60) {
    return { kind: "seconds", value: ageSeconds };
  }

  return { kind: "minutes", value: Math.floor(ageSeconds / 60) };
}
