import {
  normalizeMobileSessionSnapshot,
} from "./session-manager";
import type { MobileSessionSnapshot } from "./session-types";

export const MOBILE_SESSION_STORAGE_KEY = "whispr.mobile.session.v1";

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
      await storage.deleteItemAsync(storageKey);
    },

    async load() {
      const raw = await storage.getItemAsync(storageKey);
      if (!raw) {
        return null;
      }

      try {
        const session = normalizeMobileSessionSnapshot(JSON.parse(raw));
        if (!session) {
          await storage.deleteItemAsync(storageKey);
          return null;
        }

        return session;
      } catch {
        await storage.deleteItemAsync(storageKey);
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
