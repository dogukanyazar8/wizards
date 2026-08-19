import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { revalidateSocketSessions } from "./session-revalidation";

type TestSocket = {
  data: {
    authSessionClientType?: "MOBILE" | "WEB";
    authSessionId?: string;
    userId?: string;
  };
  disconnect(close: boolean): void;
  disconnected: boolean;
};

type TestSession = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  revokedAt: Date | null;
  user: {
    deletedAt: Date | null;
    id: string;
    isBanned: boolean;
    sessionsRevokedAfter: Date | null;
  };
  userId: string;
};

function createSocket(
  userId: string,
  authSessionId: string,
  authSessionClientType: "MOBILE" | "WEB" = "WEB",
): TestSocket {
  return {
    data: { authSessionClientType, authSessionId, userId },
    disconnect(close) {
      assert.equal(close, true);
      this.disconnected = true;
    },
    disconnected: false,
  };
}

function createSession(
  id: string,
  overrides: Omit<Partial<TestSession>, "user"> & { user?: Partial<TestSession["user"]> } = {},
): TestSession {
  const { user, ...sessionOverrides } = overrides;
  return {
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    expiresAt: new Date("2026-08-19T10:00:00.000Z"),
    id,
    revokedAt: null,
    userId: "user-1",
    ...sessionOverrides,
    user: {
      deletedAt: null,
      id: "user-1",
      isBanned: false,
      sessionsRevokedAfter: null,
      ...user,
    },
  };
}

describe("socket session revalidation", () => {
  it("does not apply web AuthSession rows to Redis-backed mobile sessions", async () => {
    const web = createSocket("user-1", "web-session");
    const mobile = createSocket("user-1", "mobile-session", "MOBILE");
    const loadedIds: string[][] = [];

    await revalidateSocketSessions([web, mobile], {
      async loadSessions(ids) {
        loadedIds.push(ids);
        return [createSession("web-session")];
      },
      now: new Date("2026-08-18T11:00:00.000Z"),
    });

    assert.deepEqual(loadedIds, [["web-session"]]);
    assert.equal(web.disconnected, false);
    assert.equal(mobile.disconnected, false);
  });

  it("disconnects all sockets after password/global revoke, ban, delete, or session revoke", async () => {
    const active = createSocket("user-1", "active");
    const activeSibling = createSocket("user-1", "active");
    const revoked = createSocket("user-1", "revoked");
    const globallyRevoked = createSocket("user-1", "globally-revoked");
    const globallyRevokedSibling = createSocket("user-1", "globally-revoked");
    const banned = createSocket("user-1", "banned");
    const deleted = createSocket("user-1", "deleted");
    const missing = createSocket("user-1", "missing");
    const wrongUser = createSocket("user-2", "wrong-user");
    const loadedIds: string[][] = [];

    await revalidateSocketSessions(
      [
        active,
        activeSibling,
        revoked,
        globallyRevoked,
        globallyRevokedSibling,
        banned,
        deleted,
        missing,
        wrongUser,
      ],
      {
        async loadSessions(ids) {
          loadedIds.push(ids);
          return [
            createSession("active"),
            createSession("revoked", { revokedAt: new Date("2026-08-18T10:30:00.000Z") }),
            createSession("globally-revoked", {
              user: { sessionsRevokedAfter: new Date("2026-08-18T10:00:00.000Z") },
            }),
            createSession("banned", { user: { isBanned: true } }),
            createSession("deleted", {
              user: { deletedAt: new Date("2026-08-18T10:30:00.000Z") },
            }),
            createSession("wrong-user"),
          ];
        },
        now: new Date("2026-08-18T11:00:00.000Z"),
      },
    );

    assert.deepEqual(loadedIds, [
      ["active", "banned", "deleted", "globally-revoked", "missing", "revoked", "wrong-user"],
    ]);
    assert.equal(active.disconnected, false);
    assert.equal(activeSibling.disconnected, false);
    for (const socket of [
      revoked,
      globallyRevoked,
      globallyRevokedSibling,
      banned,
      deleted,
      missing,
      wrongUser,
    ]) {
      assert.equal(socket.disconnected, true);
    }
  });

  it("fails closed for every snapshotted socket when the batch database check fails", async () => {
    const first = createSocket("user-1", "session-1");
    const second = createSocket("user-2", "session-2");

    await revalidateSocketSessions([first, second], {
      async loadSessions() {
        throw new Error("database unavailable");
      },
      now: new Date("2026-08-18T11:00:00.000Z"),
    });

    assert.equal(first.disconnected, true);
    assert.equal(second.disconnected, true);
  });
});
