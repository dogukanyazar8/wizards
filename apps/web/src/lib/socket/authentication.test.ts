import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authenticateMobileSocketToken, authenticateWebSocketToken } from "./authentication";

type SocketAuthUser = {
  customStatus: string | null;
  deletedAt: Date | null;
  displayName: string | null;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
  sessionsRevokedAfter: Date | null;
  settings: { presenceVisibility: "EVERYONE" | "FRIENDS" | "NOBODY" } | null;
  username: string;
};

const activeUser: SocketAuthUser = {
  customStatus: null,
  deletedAt: null,
  displayName: "User One",
  emailVerified: true,
  id: "user-1",
  isBanned: false,
  sessionsRevokedAfter: null,
  settings: { presenceVisibility: "FRIENDS" },
  username: "user_one",
};

describe("socket authentication", () => {
  it("accepts an active web Auth.js session and returns its durable identity", async () => {
    let userLoads = 0;

    const result = await authenticateWebSocketToken(
      { authSessionId: "session-1", id: "user-1", sessionStartedAt: 100 },
      {
        checkAuthSession: async () => true,
        checkGlobalRevocation: async (_userId, _startedAt, loadUser) => {
          assert.equal((await loadUser())?.sessionsRevokedAfter, null);
          return false;
        },
        loadUser: async () => {
          userLoads += 1;
          return activeUser;
        },
      },
    );

    assert.deepEqual(result, {
      authSessionId: "session-1",
      authSessionStartedAtSeconds: 100,
      clientType: "WEB",
      user: activeUser,
    });
    assert.equal(userLoads, 1);
  });

  it("rejects revoked, globally revoked, and unavailable web session controls", async () => {
    const token = { authSessionId: "session-1", id: "user-1", sessionStartedAt: 100 };
    const loadUser = async () => activeUser;

    const durableRevoked = await authenticateWebSocketToken(token, {
      checkAuthSession: async () => false,
      checkGlobalRevocation: async () => false,
      loadUser,
    });
    const globallyRevoked = await authenticateWebSocketToken(token, {
      checkAuthSession: async () => true,
      checkGlobalRevocation: async () => true,
      loadUser,
    });
    await assert.rejects(
      () =>
        authenticateWebSocketToken(token, {
          checkAuthSession: async () => {
            throw new Error("database unavailable");
          },
          checkGlobalRevocation: async () => false,
          loadUser,
        }),
      { message: "Session verification temporarily unavailable" },
    );
    const revokedToken = await authenticateWebSocketToken(
      { ...token, revoked: true },
      {
        checkAuthSession: async () => true,
        checkGlobalRevocation: async () => false,
        loadUser,
      },
    );

    assert.equal(durableRevoked, null);
    assert.equal(globallyRevoked, null);
    assert.equal(revokedToken, null);
  });

  it("preserves mobile bearer verification and carries its session id", async () => {
    const result = await authenticateMobileSocketToken("signed-mobile-token", {
      checkSession: async (claims) => claims.sessionId === "mobile-session-1",
      loadUser: async () => activeUser,
      verifyToken: () => ({
        scopes: ["mobile:bootstrap"] as const,
        sessionId: "mobile-session-1",
        userId: "user-1",
      }),
    });

    assert.deepEqual(result, {
      authSessionId: "mobile-session-1",
      clientType: "MOBILE",
      user: activeUser,
    });
  });
});
