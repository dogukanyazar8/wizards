import { normalizeMobileSessionSnapshot } from "./session-manager";
import type { MobileSessionSnapshot } from "./session-types";

export const MOBILE_SESSION_STORAGE_KEY = "whispr.mobile.session.v1";
const MOBILE_SESSION_CLEARED_MARKER = '{"cleared":true}';

export interface MobileSecureKeyValueStorage {
  deleteItemAsync(key: string): Promise<void>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export interface MobileSessionRepository {
  clear(): Promise<void>;
  load(): Promise<MobileSessionSnapshot | null>;
  save(session: MobileSessionSnapshot): Promise<void>;
}

interface MobileSessionRepositoryOptions {
  storageKey?: string;
}

export function createMobileSessionRepository(
  storage: MobileSecureKeyValueStorage,
  options: MobileSessionRepositoryOptions = {},
): MobileSessionRepository {
  const storageKey = options.storageKey ?? MOBILE_SESSION_STORAGE_KEY;

  return {
    async clear() {
      // Write a durable non-session tombstone before best-effort deletion. If
      // SecureStore deletion fails and the process dies, the next launch still
      // normalizes this value to null instead of reviving old credentials.
      await storage.setItemAsync(storageKey, MOBILE_SESSION_CLEARED_MARKER);
      try {
        await storage.deleteItemAsync(storageKey);
      } catch {
        // The tombstone is already durable; a later load will retry deletion.
      }
    },

    async load() {
      const raw = await storage.getItemAsync(storageKey);
      if (!raw) {
        return null;
      }

      try {
        const session = normalizeMobileSessionSnapshot(JSON.parse(raw));
        if (!session) {
          try {
            await storage.deleteItemAsync(storageKey);
          } catch {
            // An invalid snapshot or tombstone is already fail-closed.
          }
          return null;
        }

        return session;
      } catch {
        try {
          await storage.deleteItemAsync(storageKey);
        } catch {
          // Corrupt storage stays unreadable and can be cleaned next launch.
        }
        return null;
      }
    },

    async save(session) {
      const normalized = normalizeMobileSessionSnapshot(session);
      if (!normalized) {
        throw new Error("Invalid Whispr mobile session snapshot.");
      }

      await storage.setItemAsync(storageKey, JSON.stringify(normalized));
    },
  };
}
