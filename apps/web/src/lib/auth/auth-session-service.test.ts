import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { setSocketServer, type AppSocketServer } from "@/lib/socket/runtime";
import type { RecordSecurityEventInput } from "@/lib/security/security-event-service";

import {
  ensureAuthSession,
  isAuthSessionActive,
  listAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
  type AuthSessionDeviceFingerprint,
  type AuthSessionRecord,
  type AuthSessionStore,
} from "./auth-session-service";

class MemoryAuthSessionStore implements AuthSessionStore {
  readonly records = new Map<string, AuthSessionRecord>();

  async countKnownDevices(
    userId: string,
    fingerprint: AuthSessionDeviceFingerprint,
    excludeSessionId: string,
  ) {
    return [...this.records.values()].filter(
      (row) =>
        row.userId === userId &&
        row.id !== excludeSessionId &&
        row.browser === fingerprint.browser &&
        row.clientType === fingerprint.clientType &&
        row.deviceType === fingerprint.deviceType &&
        row.os === fingerprint.os,
    ).length;
  }

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

/**
 * Ayarlar Ş3. The default recorder writes to the database; every call in this file injects a
 * collector instead, so the unit tests stay offline and can assert what would have been logged.
 */
function createEventRecorder() {
  const events: RecordSecurityEventInput[] = [];
  const recordEvent = async (input: RecordSecurityEventInput) => {
    events.push(input);
  };
  return { events, recordEvent };
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
    const { recordEvent } = createEventRecorder();
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
        recordEvent,
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
        recordEvent,
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
    const { recordEvent } = createEventRecorder();
    store.records.set("current", record({ id: "current" }));
    store.records.set("other", record({ clientType: "MOBILE", id: "other" }));
    store.records.set("foreign", record({ id: "foreign", userId: "user-2" }));

    assert.equal(await revokeAuthSession("user-1", "foreign", { now, recordEvent, store }), null);
    assert.equal(
      (await revokeAuthSession("user-1", "other", { now, recordEvent, store }))?.id,
      "other",
    );

    store.records.set("other-2", record({ clientType: "MOBILE", id: "other-2" }));
    const revoked = await revokeOtherAuthSessions("user-1", "current", {
      now,
      recordEvent,
      store,
    });
    assert.deepEqual(
      revoked.map((row) => row.id),
      ["other-2"],
    );
    assert.equal(store.records.get("current")?.revokedAt, null);
    assert.equal(store.records.get("foreign")?.revokedAt, null);
  });

  it("keeps the caller signed in after revoke-others and logs one SESSION_REVOKED row", async () => {
    // Ayarlar Ş3 §4 / tuzak #13 regression. "Diğerlerini kapat" must never end the session that
    // pressed it: the row stays unrevoked and still passes the durable-session check.
    const store = new MemoryAuthSessionStore();
    const { events, recordEvent } = createEventRecorder();
    store.records.set("current", record({ id: "current" }));
    store.records.set("other-1", record({ id: "other-1" }));
    store.records.set("other-2", record({ clientType: "MOBILE", id: "other-2" }));

    await revokeOtherAuthSessions("user-1", "current", { now, recordEvent, store });

    assert.equal(store.records.get("current")?.revokedAt, null);
    assert.equal(await isAuthSessionActive("user-1", "current", { now, store }), true);
    assert.equal(await isAuthSessionActive("user-1", "other-1", { now, store }), false);
    assert.equal(await isAuthSessionActive("user-1", "other-2", { now, store }), false);
    assert.deepEqual(events, [
      {
        kind: "SESSION_REVOKED",
        metadata: { revokedCount: 2, scope: "others" },
        userId: "user-1",
      },
    ]);
  });

  it("writes no SESSION_REVOKED row when there was nothing to revoke", async () => {
    const store = new MemoryAuthSessionStore();
    const { events, recordEvent } = createEventRecorder();
    store.records.set("current", record({ id: "current" }));

    await revokeOtherAuthSessions("user-1", "current", { now, recordEvent, store });
    await revokeAuthSession("user-1", "missing", { now, recordEvent, store });

    assert.deepEqual(events, []);
  });

  it("logs LOGIN_NEW_DEVICE only for the first session from a device", async () => {
    const store = new MemoryAuthSessionStore();
    const { events, recordEvent } = createEventRecorder();
    const metadata = {
      appVersion: null,
      browser: "Chrome",
      clientType: "WEB",
      countryCode: "TR",
      deviceType: "DESKTOP",
      os: "Windows",
    } as const;

    await ensureAuthSession(
      { expiresAt: record().expiresAt, id: "session-1", metadata, now, recordEvent, userId: "u1" },
      store,
    );
    await ensureAuthSession(
      {
        expiresAt: record().expiresAt,
        id: "session-2",
        metadata,
        now: new Date("2026-08-13T10:00:00.000Z"),
        recordEvent,
        userId: "u1",
      },
      store,
    );
    await ensureAuthSession(
      {
        expiresAt: record().expiresAt,
        id: "session-3",
        metadata: { ...metadata, browser: "Firefox" },
        now: new Date("2026-08-13T11:00:00.000Z"),
        recordEvent,
        userId: "u1",
      },
      store,
    );

    assert.deepEqual(events, [
      { kind: "LOGIN_NEW_DEVICE", location: "TR", userAgent: "Chrome", userId: "u1" },
      { kind: "LOGIN_NEW_DEVICE", location: "TR", userAgent: "Firefox", userId: "u1" },
    ]);
  });

  it("does not log a new device when an existing session is only touched", async () => {
    const store = new MemoryAuthSessionStore();
    const { events, recordEvent } = createEventRecorder();
    const metadata = {
      appVersion: null,
      browser: "Chrome",
      clientType: "WEB",
      countryCode: "TR",
      deviceType: "DESKTOP",
      os: "Windows",
    } as const;

    await ensureAuthSession(
      { expiresAt: record().expiresAt, id: "session-1", metadata, now, recordEvent, userId: "u1" },
      store,
    );
    await ensureAuthSession(
      {
        expiresAt: record().expiresAt,
        id: "session-1",
        metadata,
        now: new Date("2026-08-13T09:30:00.000Z"),
        recordEvent,
        userId: "u1",
      },
      store,
    );

    assert.equal(events.length, 1);
  });

  it("disconnects only durable sessions that were actually revoked", async () => {
    const store = new MemoryAuthSessionStore();
    const { recordEvent } = createEventRecorder();
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
        recordEvent,
        store,
      }),
      null,
    );
    assert.equal(
      (
        await revokeAuthSession("user-1", "other-1", {
          disconnectSockets,
          now,
          recordEvent,
          store,
        })
      )?.id,
      "other-1",
    );
    await revokeOtherAuthSessions("user-1", "current", {
      disconnectSockets,
      now,
      recordEvent,
      store,
    });

    assert.deepEqual(disconnectedSessions, ["other-1", "other-2"]);
  });
});

it("known desktop sessions are described as Whispr without rewriting historical storage", async () => {
  const store = new MemoryAuthSessionStore();
  store.records.set("desktop", record({ id: "desktop", clientType: "DESKTOP", browser: "Edge" }));
  store.records.set("web", record({ id: "web", clientType: "WEB", browser: "Edge" }));
  const result = await listAuthSessions("user-1", "desktop", { now, store });
  assert.equal(
    result.sessions.find((session) => session.id === "desktop")?.browser,
    "Whispr Desktop",
  );
  assert.equal(result.sessions.find((session) => session.id === "web")?.browser, "Edge");
  assert.equal(store.records.get("desktop")?.browser, "Edge");
});

it("notifies only the owning account after creation and actual revocation, not heartbeats", async () => {
  const sent: Array<{ room: string; event: string; payload: unknown }> = [];
  setSocketServer({
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => sent.push({ room, event, payload }),
    }),
  } as unknown as AppSocketServer);
  const store = new MemoryAuthSessionStore();
  const { recordEvent } = createEventRecorder();
  const input = {
    id: "realtime-session",
    userId: "user-1",
    expiresAt: new Date(now.getTime() + 86400000),
    metadata: null,
    now,
    recordEvent,
  };
  try {
    await ensureAuthSession(input, store);
    assert.deepEqual(sent, [
      {
        room: "user:user-1",
        event: "account:security:changed",
        payload: { sessionsChanged: true },
      },
    ]);
    await ensureAuthSession({ ...input, now: new Date(now.getTime() + 60000) }, store);
    assert.equal(sent.length, 1);
    await revokeAuthSession("someone-else", input.id, {
      store,
      recordEvent,
      disconnectSockets: () => {},
    });
    assert.equal(sent.length, 1);
    await revokeAuthSession(input.userId, input.id, {
      store,
      recordEvent,
      disconnectSockets: () => {},
    });
    assert.equal(sent.length, 2);
    assert.equal(sent[1]?.room, "user:user-1");
    await revokeAuthSession(input.userId, input.id, {
      store,
      recordEvent,
      disconnectSockets: () => {},
    });
    assert.equal(sent.length, 2);
  } finally {
    setSocketServer(null);
  }
});
