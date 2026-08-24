"use client";

import {
  DISCOVER_NEW_BADGE_TTL_MS,
  DISCOVER_SEEN_SERVERS_STORAGE_KEY,
} from "@/lib/discover/contracts";

const MAX_SEEN_SERVERS = 200;

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** joinedAt 24 saatten yeni VE sunucu henüz ziyaret edilmemişse true. */
export function isNewServer(
  serverId: string,
  joinedAt: string | null,
  now: number,
  seen: ReadonlySet<string>,
): boolean {
  if (seen.has(serverId)) {
    return false;
  }
  if (joinedAt === null) {
    return true;
  }

  const joinedAtMs = Date.parse(joinedAt);
  const age = now - joinedAtMs;
  return Number.isFinite(joinedAtMs) && age >= 0 && age < DISCOVER_NEW_BADGE_TTL_MS;
}

export function readSeenServers(): Set<string> {
  try {
    const raw = browserStorage()?.getItem(DISCOVER_SEEN_SERVERS_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
      return new Set();
    }
    return new Set(parsed.slice(-MAX_SEEN_SERVERS));
  } catch {
    return new Set();
  }
}

export function markServerSeen(serverId: string): void {
  const storage = browserStorage();
  if (!storage) {
    return;
  }

  const seen = [...readSeenServers()].filter((id) => id !== serverId);
  seen.push(serverId);
  try {
    storage.setItem(
      DISCOVER_SEEN_SERVERS_STORAGE_KEY,
      JSON.stringify(seen.slice(-MAX_SEEN_SERVERS)),
    );
  } catch {
    // Gizli mod veya kota hatası gezinmeyi engellememeli; rozet görünür kalır.
  }
}
