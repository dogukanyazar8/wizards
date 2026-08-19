import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ensureAuthSession,
  isAuthSessionActive,
  listAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
  type AuthSessionRecord,
  type AuthSessionStore,
} from "./auth-session-service";

class MemoryAuthSessionStore implements AuthSessionStore {
  readonly records = new Map<string, AuthSessionRecord>();

  async find(id: string) {
    return this.records.get(id) ?? null;
  }

  async listActive(userId: string, now: Date, limit: number) {
    return [...this.records.values()]
      .filter((row) => row.userId === userId && row.revokedAt === null && row.expiresAt > now)
      .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
      .slice(0, limit);
  }

  async revoke(id: string, userId: string, revokedAt: Date) {
    const record = this.records.get(id);
    if (!record || record.userId !== userId || record.revokedAt) return null;
    const next = { ...record, revokedAt };
    this.records.set(id, next);
    return next;
  }

  async revokeOthers(userId: string, currentSessionId: string, revokedAt: Date) {
    const revoked: AuthSessionRecord[] = [];
    for (const record of this.records.values()) {
      if (record.userId === userId && record.id !== currentSessionId && !record.revokedAt) {
        const next = { ...record, revokedAt };
        this.records.set(record.id, next);
        revoked.push(next);
      }
    }
    return revoked;
  }

  async upsert(record: AuthSessionRecord) {
    const previous = this.records.get(record.id);
    const next = previous
      ? {
          ...previous,
          ...record,
          createdAt: previous.createdAt,
          revokedAt: previous.revokedAt,
        }
      : record;
    this.records.set(record.id, next);
    return next;
  }
}

const now = new Date("2026-08-13T09:00:00.000Z");

function record(overrides: Partial<AuthSessionRecord> = {}): AuthSessionRecord {
  return {
    appVersion: null,
    browser: "Chrome",
    clientType: "WEB",
    countryCode: "TR",
    createdAt: new Date("2026-08-13T08:00:00.000Z"),
    deviceType: "DESKTOP",
    expiresAt: new Date("2026-09-12T08:00:00.000Z"),
    id: "session-1",
    lastSeenAt: now,
    os: "Windows",
    revokedAt: null,
    userId: "user-1",
    ...overrides,
  };
}

describe("auth session service", () => {
  it("creates a safe session record and preserves a prior revocation", async () => {
    const store = new MemoryAuthSessionStore();
    await ensureAuthSession(
      {
        expiresAt: new Date("2026-09-12T08:00:00.000Z"),
        id: "session-1",
        metadata: {
          appVersion: "0.8.15",
          browser: "Chrome",
          clientType: "DESKTOP",
          countryCode: "tr",
          deviceType: "DESKTOP",
          os: "W".repeat(200),
        },
        now,
        userId: "user-1",
      },
      store,
    );

    const created = store.records.get("session-1");
    assert.equal(created?.countryCode, "TR");
    assert.equal(created?.os?.length, 128);
    assert.equal("ipAddress" in (created ?? {}), false);

    await store.revoke("session-1", "user-1", now);
    await ensureAuthSession(
      {
        expiresAt: new Date("2026-09-13T08:00:00.000Z"),
        id: "session-1",
        metadata: null,
        now: new Date("2026-08-13T09:05:00.000Z"),
        userId: "user-1",
      },
      store,
    );
    assert.equal(store.records.get("session-1")?.revokedAt?.toISOString(), now.toISOString());
  });

  it("lists only active unexpired sessions and marks the current one", async () => {
    const store = new MemoryAuthSessionStore();
    store.records.set("current", record({ id: "current" }));
    store.records.set(
      "other",
      record({ id: "other", lastSeenAt: new Date("2026-08-13T08:30:00Z") }),
    );
    store.records.set("revoked", record({ id: "revoked", revokedAt: now }));
    store.records.set(
      "expired",
      record({ expiresAt: new Date("2026-08-13T08:59:59Z"), id: "expired" }),
    );

    const result = await listAuthSessions("user-1", "current", { now, store });
    assert.deepEqual(
      result.sessions.map(({ current, id }) => ({ current, id })),
      [
        { current: true, id: "current" },
        { current: false, id: "other" },
      ],
    );
  });

  it("distinguishes legacy missing records from revoked or expired records", async () => {
    const store = new MemoryAuthSessionStore();
    store.records.set("active", record({ id: "active" }));
    store.records.set("revoked", record({ id: "revoked", revokedAt: now }));
    store.records.set(
      "expired",
      record({ expiresAt: new Date("2026-08-13T08:00:00Z"), id: "expired" }),
    );

    assert.equal(await isAuthSessionActive("user-1", "missing", { now, store }), null);
    assert.equal(await isAuthSessionActive("user-1", "active", { now, store }), true);
    assert.equal(await isAuthSessionActive("user-1", "revoked", { now, store }), false);
    assert.equal(await isAuthSessionActive("user-1", "expired", { now, store }), false);
    assert.equal(await isAuthSessionActive("user-2", "active", { now, store }), false);
  });

  it("revokes only owned targets and preserves the current session in bulk", async () => {
    const store = new MemoryAuthSessionStore();
    store.records.set("current", record({ id: "current" }));
    store.records.set("other", record({ clientType: "MOBILE", id: "other" }));
    store.records.set("foreign", record({ id: "foreign", userId: "user-2" }));

    assert.equal(await revokeAuthSession("user-1", "foreign", { now, store }), null);
    assert.equal((await revokeAuthSession("user-1", "other", { now, store }))?.id, "other");

    store.records.set("other-2", record({ clientType: "MOBILE", id: "other-2" }));
    const revoked = await revokeOtherAuthSessions("user-1", "current", { now, store });
    assert.deepEqual(
      revoked.map((row) => row.id),
      ["other-2"],
    );
    assert.equal(store.records.get("current")?.revokedAt, null);
    assert.equal(store.records.get("foreign")?.revokedAt, null);
  });

  it("disconnects only durable sessions that were actually revoked", async () => {
    const store = new MemoryAuthSessionStore();
    const disconnectedSessions: string[] = [];
    const disconnectSockets = (sessionId: string) => {
      disconnectedSessions.push(sessionId);
    };
    store.records.set("current", record({ id: "current" }));
    store.records.set("other-1", record({ id: "other-1" }));
    store.records.set("other-2", record({ id: "other-2" }));
    store.records.set("foreign", record({ id: "foreign", userId: "user-2" }));

    assert.equal(
      await revokeAuthSession("user-1", "foreign", {
        disconnectSockets,
        now,
        store,
      }),
      null,
    );
    assert.equal(
      (
        await revokeAuthSession("user-1", "other-1", {
          disconnectSockets,
          now,
          store,
        })
      )?.id,
      "other-1",
    );
    await revokeOtherAuthSessions("user-1", "current", {
      disconnectSockets,
      now,
      store,
    });

    assert.deepEqual(disconnectedSessions, ["other-1", "other-2"]);
  });
});
