import {
  MOBILE_MESSAGE_STORE_MAX_AGE_MS,
  MOBILE_MESSAGE_STORE_MAX_TARGETS,
  MOBILE_PERFORMANCE_SAMPLE_LOG_CAP,
  isMobileStoredMessagePageFresh,
  parseMobileStoredMessagePage,
  parseMobileStoredPerformanceSample,
  serializeMobileStoredMessagePage,
  serializeMobileStoredPerformanceContext,
  type MobileStoredPerformanceSample,
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

/**
 * A stored page with the moment it was written.
 *
 * The timestamp is not decoration: a page seeded into the query cache without it
 * looks freshly fetched, so the stream stayed "fresh" for its whole stale window
 * and the network never reconciled a page that could be a day old.
 */
export type MobileMessageStorePageEntry = {
  readonly payload: unknown;
  readonly updatedAt: number;
};

/** What the device panel needs to prove the cache is real and encrypted. */
export type MobileMessageStoreDiagnostics = {
  readonly cipherVersion: string | null;
  readonly rowCount: number | null;
  readonly status: "sealed" | "unavailable" | "open";
};

export interface MobileMessageStore {
  /**
   * Appends measurements to the retained log.
   *
   * Idempotent on `sampleId`: the writer may hand over a sample it already
   * persisted, and a second arrival must not become a second data point.
   */
  appendPerformanceSamples(input: {
    readonly now?: number;
    readonly samples: readonly MobileStoredPerformanceSample[];
  }): Promise<void>;
  /** Closes the connection and seals writes until `resume()`. */
  close(): Promise<void>;
  /** Drops one target's page — what a revoked conversation needs. */
  deletePage(input: {
    readonly scope: MobileMessageStoreScope;
    readonly targetId: string;
    readonly userId: string;
  }): Promise<void>;
  /**
   * Read-only self-report. `cipherVersion` is the only honest proof that the build
   * has SQLCipher compiled in — a plain SQLite build accepts `PRAGMA key` and would
   * otherwise look identical.
   */
  describe(): Promise<MobileMessageStoreDiagnostics>;
  purgeAll(): Promise<void>;
  /** Clears the measurement log alone, so a baseline run can start from empty. */
  purgePerformanceSamples(): Promise<void>;
  purgeUser(userId: string): Promise<void>;
  readPage(input: MobileMessageStoreTarget): Promise<unknown>;
  /** The same read, with the write time the restore path needs. */
  readPageEntry(input: MobileMessageStoreTarget): Promise<MobileMessageStorePageEntry | null>;
  /** The retained measurements, oldest first. */
  readPerformanceSamples(): Promise<readonly MobileStoredPerformanceSample[]>;
  /** Re-opens the store for a new session after a wipe. */
  resume(): void;
  writePage(input: MobileMessageStoreTarget & { readonly payload: unknown }): Promise<void>;
}

type MobileMessageStoreRow = {
  payload: string;
  updated_at: number;
};

/**
 * `user_id` is part of `message_pages`' primary key rather than a filter added
 * later.
 *
 * The sign-out purge can fail — a locked database, a process killed mid-wipe —
 * and the namespace is what makes that survivable: a read for one account cannot
 * return another account's row even if the old rows are still on disk.
 *
 * `performance_samples` is the device's own measurement log, and it is here
 * rather than in the reporter's queue because those are opposite jobs: the
 * reporter *hands measurements away*, draining the in-memory log on an interval
 * and on every background transition, while a baseline run needs them to
 * accumulate across ten launches. Sharing one buffer is why every budgeted
 * metric read n=0 after a full session. It carries no account column — these are
 * timings of this install, not content belonging to a reader, and a launch is
 * measured before any session is resolved.
 */
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS message_pages (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, scope, target_id)
);

CREATE TABLE IF NOT EXISTS performance_samples (
  sample_id TEXT PRIMARY KEY,
  metric TEXT NOT NULL,
  surface TEXT NOT NULL,
  duration_ms REAL NOT NULL,
  context TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
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

  async function readPageEntry({
    now = Date.now(),
    scope,
    targetId,
    userId,
  }: MobileMessageStoreTarget): Promise<MobileMessageStorePageEntry | null> {
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

      const payload = parseMobileStoredMessagePage(row.payload);
      return payload === null ? null : { payload, updatedAt: row.updated_at };
    } catch {
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
    async appendPerformanceSamples({ now = Date.now(), samples }) {
      if (samples.length === 0) {
        return;
      }

      const database = await connect();
      if (!database) {
        throw new Error("Mobile performance sample store is unavailable.");
      }

      try {
        for (const [index, sample] of samples.entries()) {
          if (sample.sampleId.length === 0) {
            continue;
          }

          await database.runAsync(
            `INSERT OR IGNORE INTO performance_samples
               (sample_id, metric, surface, duration_ms, context, recorded_at)
             VALUES (?, ?, ?, ?, ?, ?);`,
            [
              sample.sampleId,
              sample.metric,
              sample.surface,
              sample.durationMs,
              serializeMobileStoredPerformanceContext(sample.context),
              // Index keeps the order of one batch stable: several samples can
              // share a millisecond, and the panel reads them back in order.
              now + index,
            ],
          );
        }

        const retained = await database.getAllAsync<{ sample_id: string }>(
          `SELECT sample_id FROM performance_samples
           ORDER BY recorded_at DESC LIMIT ${MOBILE_PERFORMANCE_SAMPLE_LOG_CAP};`,
          [],
        );
        const placeholders = retained.map(() => "?").join(", ");
        await database.runAsync(
          `DELETE FROM performance_samples WHERE sample_id NOT IN (${placeholders});`,
          retained.map((row) => row.sample_id),
        );
      } catch (error) {
        // The persistence layer owns retries; hiding this failure there would
        // acknowledge a sample that never became durable.
        throw error;
      }
    },

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

    deletePage({ scope, targetId, userId }) {
      return deleteWhere(
        "DELETE FROM message_pages WHERE user_id = ? AND scope = ? AND target_id = ?;",
        [userId, scope, targetId],
      );
    },

    purgeAll() {
      return deleteWhere("DELETE FROM message_pages;", []);
    },

    purgePerformanceSamples() {
      return deleteWhere("DELETE FROM performance_samples;", []);
    },

    purgeUser(userId) {
      return deleteWhere("DELETE FROM message_pages WHERE user_id = ?;", [userId]);
    },

    async readPerformanceSamples() {
      const database = await connect();
      if (!database) {
        return [];
      }

      try {
        const rows = await database.getAllAsync<Record<string, unknown>>(
          `SELECT sample_id, metric, surface, duration_ms, context, recorded_at
           FROM performance_samples ORDER BY recorded_at ASC;`,
          [],
        );

        return rows.flatMap((row) => {
          const parsed = parseMobileStoredPerformanceSample(row);
          return parsed ? [parsed] : [];
        });
      } catch {
        return [];
      }
    },

    async readPage(input) {
      return (await readPageEntry(input))?.payload ?? null;
    },

    readPageEntry,

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
