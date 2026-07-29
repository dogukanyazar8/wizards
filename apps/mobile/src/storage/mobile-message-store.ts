import {
  MOBILE_MESSAGE_STORE_MAX_AGE_MS,
  MOBILE_MESSAGE_STORE_MAX_TARGETS,
  isMobileStoredMessagePageFresh,
  parseMobileStoredMessagePage,
  serializeMobileStoredMessagePage,
} from "./mobile-message-store-policy";

export type MobileMessageStoreScope = "channel" | "dm";

/** Everything this store binds: no blobs, no booleans. */
export type MobileMessageStoreBindValue = number | string | null;

/** The slice of `expo-sqlite` this store uses, so its behaviour is testable. */
export interface MobileMessageStoreDatabase {
  closeAsync(): Promise<void>;
  execAsync(source: string): Promise<void>;
  getAllAsync<T>(source: string, params: MobileMessageStoreBindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: MobileMessageStoreBindValue[]): Promise<T | null>;
  runAsync(source: string, params: MobileMessageStoreBindValue[]): Promise<unknown>;
}

/**
 * Whether the connection that just opened is actually encrypted.
 *
 * Plain SQLite ignores an unknown pragma, so `PRAGMA key` *succeeds* on a build
 * without SQLCipher and every message body would be written to an unencrypted
 * file. `PRAGMA cipher_version` answers with a version only when the cipher is
 * compiled in, so it is the one honest signal — and the cache refuses to run
 * without it rather than silently downgrading.
 */
export function assertMobileMessageStoreEncrypted(
  row: { readonly cipher_version?: unknown } | null,
): boolean {
  const version = row?.cipher_version;
  return typeof version === "string" && version.trim().length > 0;
}

export type MobileMessageStoreTarget = {
  readonly now?: number;
  readonly scope: MobileMessageStoreScope;
  readonly targetId: string;
  /** Every row is account-scoped; see the namespace note below. */
  readonly userId: string;
};

/** What the device panel needs to prove the cache is real and encrypted. */
export type MobileMessageStoreDiagnostics = {
  readonly cipherVersion: string | null;
  readonly rowCount: number | null;
  readonly status: "sealed" | "unavailable" | "open";
};

export interface MobileMessageStore {
  /** Closes the connection and seals writes until `resume()`. */
  close(): Promise<void>;
  /**
   * Read-only self-report. `cipherVersion` is the only honest proof that the build
   * has SQLCipher compiled in — a plain SQLite build accepts `PRAGMA key` and would
   * otherwise look identical.
   */
  describe(): Promise<MobileMessageStoreDiagnostics>;
  purgeAll(): Promise<void>;
  purgeUser(userId: string): Promise<void>;
  readPage(input: MobileMessageStoreTarget): Promise<unknown>;
  /** Re-opens the store for a new session after a wipe. */
  resume(): void;
  writePage(input: MobileMessageStoreTarget & { readonly payload: unknown }): Promise<void>;
}

type MobileMessageStoreRow = {
  payload: string;
  updated_at: number;
};

/**
 * `user_id` is part of the primary key rather than a filter added later.
 *
 * The sign-out purge can fail — a locked database, a process killed mid-wipe —
 * and the namespace is what makes that survivable: a read for one account cannot
 * return another account's row even if the old rows are still on disk.
 */
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS message_pages (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, scope, target_id)
);`;

/**
 * The newest page of a message stream, per account and target, encrypted at rest.
 *
 * Every call is best effort: a device that cannot open the encrypted database —
 * no keystore yet, a rotated key, a corrupt file — must still run the app against
 * the network, which is what it did before this cache existed. So failures resolve
 * to "nothing cached" rather than propagating.
 */
export function createMobileMessageStore(input: {
  readonly openDatabase: () => Promise<MobileMessageStoreDatabase>;
}): MobileMessageStore {
  let databasePromise: Promise<MobileMessageStoreDatabase> | null = null;
  let sealed = false;

  async function connect(): Promise<MobileMessageStoreDatabase | null> {
    if (sealed) {
      return null;
    }

    if (!databasePromise) {
      databasePromise = input.openDatabase().then(async (database) => {
        await database.execAsync(CREATE_TABLE);
        return database;
      });
    }

    try {
      return await databasePromise;
    } catch {
      // Retry on the next call rather than latching a dead connection: the
      // keystore can become available again (first unlock after boot).
      databasePromise = null;
      return null;
    }
  }

  async function deleteWhere(source: string, params: MobileMessageStoreBindValue[]) {
    const database = await connect();
    if (!database) {
      return;
    }

    try {
      await database.runAsync(source, params);
    } catch {
      // Sign-out must complete. Rows stay account-scoped and age out anyway.
    }
  }

  return {
    async describe() {
      if (sealed) {
        return { cipherVersion: null, rowCount: null, status: "sealed" as const };
      }

      const database = await connect();
      if (!database) {
        return { cipherVersion: null, rowCount: null, status: "unavailable" as const };
      }

      try {
        const cipher = await database.getFirstAsync<{ cipher_version?: unknown }>(
          "PRAGMA cipher_version;",
          [],
        );
        const counted = await database.getFirstAsync<{ total?: unknown }>(
          "SELECT COUNT(*) AS total FROM message_pages;",
          [],
        );
        const total = counted?.total;

        return {
          cipherVersion:
            typeof cipher?.cipher_version === "string" ? cipher.cipher_version.trim() : null,
          rowCount: typeof total === "number" ? total : null,
          status: "open" as const,
        };
      } catch {
        return { cipherVersion: null, rowCount: null, status: "unavailable" as const };
      }
    },

    async close() {
      sealed = true;
      const pending = databasePromise;
      databasePromise = null;
      if (!pending) {
        return;
      }

      try {
        await (await pending).closeAsync();
      } catch {
        // A connection that cannot be closed is already unusable.
      }
    },

    resume() {
      sealed = false;
    },

    purgeAll() {
      return deleteWhere("DELETE FROM message_pages;", []);
    },

    purgeUser(userId) {
      return deleteWhere("DELETE FROM message_pages WHERE user_id = ?;", [userId]);
    },

    async readPage({ now = Date.now(), scope, targetId, userId }) {
      if (targetId.length === 0 || userId.length === 0) {
        return null;
      }

      const database = await connect();
      if (!database) {
        return null;
      }

      try {
        const row = await database.getFirstAsync<MobileMessageStoreRow>(
          "SELECT payload, updated_at FROM message_pages WHERE user_id = ? AND scope = ? AND target_id = ?;",
          [userId, scope, targetId],
        );
        if (!row || !isMobileStoredMessagePageFresh(row.updated_at, now)) {
          return null;
        }

        return parseMobileStoredMessagePage(row.payload);
      } catch {
        return null;
      }
    },

    async writePage({ now = Date.now(), payload, scope, targetId, userId }) {
      if (targetId.length === 0 || userId.length === 0) {
        return;
      }

      const database = await connect();
      if (!database) {
        return;
      }

      try {
        await database.runAsync(
          `INSERT INTO message_pages (user_id, scope, target_id, payload, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, scope, target_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at;`,
          [userId, scope, targetId, serializeMobileStoredMessagePage(payload), now],
        );
        await database.runAsync("DELETE FROM message_pages WHERE updated_at < ?;", [
          now - MOBILE_MESSAGE_STORE_MAX_AGE_MS,
        ]);

        const stored = await database.getAllAsync<{ target_id: string }>(
          "SELECT target_id FROM message_pages WHERE user_id = ? AND scope = ? ORDER BY updated_at DESC;",
          [userId, scope],
        );
        const keep = stored.slice(0, MOBILE_MESSAGE_STORE_MAX_TARGETS);
        const placeholders = keep.map(() => "?").join(", ");
        await database.runAsync(
          `DELETE FROM message_pages WHERE user_id = ? AND scope = ? AND target_id NOT IN (${placeholders});`,
          [userId, scope, ...keep.map((row) => row.target_id)],
        );
      } catch {
        // A write that does not land only costs the next cold start a network read.
      }
    },
  };
}
