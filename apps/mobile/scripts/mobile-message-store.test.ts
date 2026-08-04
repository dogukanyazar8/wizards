import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_MESSAGE_STORE_MAX_AGE_MS,
  MOBILE_MESSAGE_STORE_MAX_TARGETS,
  MOBILE_MESSAGE_STORE_SCHEMA_VERSION,
  isMobileStoredMessagePageFresh,
  parseMobileStoredMessagePage,
  serializeMobileStoredMessagePage,
} from "../src/storage/mobile-message-store-policy";
import {
  assertMobileMessageStoreEncrypted,
  createMobileMessageStore,
  type MobileMessageStoreBindValue,
  type MobileMessageStoreDatabase,
} from "../src/storage/mobile-message-store";

const page = { channel: { id: "channel-1" }, hasMore: false, messages: [{ id: "m-1" }] };

type Row = {
  payload: string;
  scope: string;
  target_id: string;
  updated_at: number;
  user_id: string;
};

/** In-memory stand-in for the encrypted database, same SQL shape. */
function createFakeDatabase() {
  const rows = new Map<string, Row>();
  const statements: string[] = [];
  let closed = false;

  const database: MobileMessageStoreDatabase = {
    async closeAsync() {
      closed = true;
    },
    async execAsync(source: string) {
      statements.push(source);
    },
    async getFirstAsync<T>(source: string, params: MobileMessageStoreBindValue[]) {
      statements.push(source);
      const [userId, scope, targetId] = params as [string, string, string];
      return (rows.get(`${userId}:${scope}:${targetId}`) as T | undefined) ?? null;
    },
    async runAsync(source: string, params: MobileMessageStoreBindValue[]) {
      statements.push(source);

      if (source.includes("target_id NOT IN")) {
        const [userId, scope, ...keep] = params as [string, string, ...string[]];
        for (const [key, row] of rows) {
          if (row.user_id === userId && row.scope === scope && !keep.includes(row.target_id)) {
            rows.delete(key);
          }
        }
        return;
      }
      if (source.includes("WHERE updated_at <")) {
        const [threshold] = params as [number];
        for (const [key, row] of rows) {
          if (row.updated_at < threshold) {
            rows.delete(key);
          }
        }
        return;
      }
      if (source.includes("WHERE user_id = ?") && source.startsWith("DELETE")) {
        const [userId] = params as [string];
        for (const [key, row] of rows) {
          if (row.user_id === userId) {
            rows.delete(key);
          }
        }
        return;
      }
      if (source.startsWith("DELETE")) {
        rows.clear();
        return;
      }

      const [userId, scope, targetId, payload, updatedAt] = params as [
        string,
        string,
        string,
        string,
        number,
      ];
      rows.set(`${userId}:${scope}:${targetId}`, {
        payload,
        scope,
        target_id: targetId,
        updated_at: updatedAt,
        user_id: userId,
      });
    },
    async getAllAsync<T>(source: string, params: MobileMessageStoreBindValue[]) {
      statements.push(source);
      const [userId, scope] = params as [string, string];
      return [...rows.values()]
        .filter((row) => row.user_id === userId && row.scope === scope)
        .sort((left, right) => right.updated_at - left.updated_at) as T[];
    },
  };

  return { database, isClosed: () => closed, rows, statements };
}

function createStore(database: MobileMessageStoreDatabase, onOpen?: () => void) {
  return createMobileMessageStore({
    openDatabase: async () => {
      onOpen?.();
      return database;
    },
  });
}

describe("mobile stored message page policy", () => {
  it("round-trips a page through the versioned envelope", () => {
    assert.deepEqual(parseMobileStoredMessagePage(serializeMobileStoredMessagePage(page)), page);
  });

  it("refuses a payload written by an older schema", () => {
    const stale = JSON.stringify({
      payload: page,
      version: MOBILE_MESSAGE_STORE_SCHEMA_VERSION - 1,
    });

    assert.equal(parseMobileStoredMessagePage(stale), null);
  });

  it("refuses payloads it cannot read at all", () => {
    assert.equal(parseMobileStoredMessagePage("not json"), null);
    assert.equal(parseMobileStoredMessagePage(JSON.stringify({ payload: null })), null);
  });

  it("treats a page past the max age as unusable", () => {
    const now = 10_000_000;

    assert.equal(isMobileStoredMessagePageFresh(now - 1_000, now), true);
    assert.equal(
      isMobileStoredMessagePageFresh(now - MOBILE_MESSAGE_STORE_MAX_AGE_MS - 1, now),
      false,
    );
  });
});

describe("createMobileMessageStore", () => {
  it("warms the encrypted connection once before the first route restore", async () => {
    const { database, statements } = createFakeDatabase();
    let opens = 0;
    const store = createStore(database, () => {
      opens += 1;
    });

    await store.warm();
    await store.warm();

    assert.equal(opens, 1);
    assert.equal(statements.filter((statement) => statement.includes("CREATE TABLE")).length, 1);
  });

  it("reads back a page it wrote for the same account, scope and target", async () => {
    const { database } = createFakeDatabase();
    const store = createStore(database);

    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "channel",
      targetId: "c-1",
      userId: "user-1",
    });

    assert.deepEqual(
      await store.readPage({ now: 2_000, scope: "channel", targetId: "c-1", userId: "user-1" }),
      page,
    );
  });

  // The purge on sign-out can fail; the namespace is what makes that survivable.
  it("never shows one account's page to another", async () => {
    const { database } = createFakeDatabase();
    const store = createStore(database);

    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "dm",
      targetId: "d-1",
      userId: "user-1",
    });

    assert.equal(
      await store.readPage({ now: 2_000, scope: "dm", targetId: "d-1", userId: "user-2" }),
      null,
    );
  });

  it("keeps scopes and targets apart", async () => {
    const { database } = createFakeDatabase();
    const store = createStore(database);

    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "channel",
      targetId: "c-1",
      userId: "user-1",
    });

    assert.equal(
      await store.readPage({ now: 2_000, scope: "dm", targetId: "c-1", userId: "user-1" }),
      null,
    );
    assert.equal(
      await store.readPage({ now: 2_000, scope: "channel", targetId: "c-2", userId: "user-1" }),
      null,
    );
  });

  it("drops a page that has aged out instead of drawing it", async () => {
    const { database } = createFakeDatabase();
    const store = createStore(database);

    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "dm",
      targetId: "d-1",
      userId: "user-1",
    });

    assert.equal(
      await store.readPage({
        now: 1_000 + MOBILE_MESSAGE_STORE_MAX_AGE_MS + 1,
        scope: "dm",
        targetId: "d-1",
        userId: "user-1",
      }),
      null,
    );
  });

  it("bounds targets per account and scope", async () => {
    const { database, rows } = createFakeDatabase();
    const store = createStore(database);

    for (let index = 0; index < MOBILE_MESSAGE_STORE_MAX_TARGETS + 3; index += 1) {
      await store.writePage({
        now: 1_000 + index,
        payload: page,
        scope: "dm",
        targetId: `d-${index}`,
        userId: "user-1",
      });
    }
    // A second account keeps its own budget.
    await store.writePage({
      now: 2_000,
      payload: page,
      scope: "dm",
      targetId: "d-0",
      userId: "user-2",
    });

    assert.equal(rows.size, MOBILE_MESSAGE_STORE_MAX_TARGETS + 1);
    assert.equal(
      await store.readPage({ now: 3_000, scope: "dm", targetId: "d-0", userId: "user-1" }),
      null,
    );
    assert.deepEqual(
      await store.readPage({ now: 3_000, scope: "dm", targetId: "d-0", userId: "user-2" }),
      page,
    );
  });

  it("purges one account without touching the other", async () => {
    const { database, rows } = createFakeDatabase();
    const store = createStore(database);
    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "dm",
      targetId: "d-1",
      userId: "user-1",
    });
    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "dm",
      targetId: "d-1",
      userId: "user-2",
    });

    await store.purgeUser("user-1");

    assert.equal(rows.size, 1);
    assert.deepEqual(
      await store.readPage({ now: 2_000, scope: "dm", targetId: "d-1", userId: "user-2" }),
      page,
    );
  });

  it("purges every account on request", async () => {
    const { database, rows } = createFakeDatabase();
    const store = createStore(database);
    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "dm",
      targetId: "d-1",
      userId: "user-1",
    });
    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "dm",
      targetId: "d-1",
      userId: "user-2",
    });

    await store.purgeAll();

    assert.equal(rows.size, 0);
  });

  it("closes the connection and seals writes until the next session", async () => {
    const { database, isClosed, rows } = createFakeDatabase();
    let opens = 0;
    const store = createStore(database, () => {
      opens += 1;
    });
    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "dm",
      targetId: "d-1",
      userId: "user-1",
    });

    await store.close();

    assert.equal(isClosed(), true);
    // Sealed: a late effect from the old session cannot resurrect its data.
    await store.writePage({
      now: 2_000,
      payload: page,
      scope: "dm",
      targetId: "d-2",
      userId: "user-1",
    });
    assert.equal(rows.has("user-1:dm:d-2"), false);
    assert.equal(
      await store.readPage({ now: 2_000, scope: "dm", targetId: "d-1", userId: "user-1" }),
      null,
    );

    store.resume();
    assert.deepEqual(
      await store.readPage({ now: 2_000, scope: "dm", targetId: "d-1", userId: "user-1" }),
      page,
    );
    assert.equal(opens, 2);
  });

  it("stays silent when the encrypted database cannot be opened", async () => {
    const store = createMobileMessageStore({
      openDatabase: async () => {
        throw new Error("keystore unavailable");
      },
    });

    assert.equal(
      await store.readPage({ now: 1_000, scope: "dm", targetId: "d-1", userId: "user-1" }),
      null,
    );
    await store.writePage({
      now: 1_000,
      payload: page,
      scope: "dm",
      targetId: "d-1",
      userId: "user-1",
    });
    await store.purgeAll();
    await store.close();
  });
});

describe("assertMobileMessageStoreEncrypted", () => {
  it("accepts a build whose SQLCipher reports a version", () => {
    assert.equal(assertMobileMessageStoreEncrypted({ cipher_version: "4.5.5 community" }), true);
  });

  // Plain SQLite ignores an unknown pragma, so `PRAGMA key` silently succeeds and
  // every message body would land unencrypted. The cache must refuse to run.
  it("refuses a build with no SQLCipher at all", () => {
    assert.equal(assertMobileMessageStoreEncrypted(null), false);
    assert.equal(assertMobileMessageStoreEncrypted({}), false);
    assert.equal(assertMobileMessageStoreEncrypted({ cipher_version: "" }), false);
    assert.equal(assertMobileMessageStoreEncrypted({ cipher_version: "   " }), false);
  });
});
