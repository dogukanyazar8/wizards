import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_SESSION_SCHEMA_VERSION,
  type MobileSessionSnapshot,
} from "../src/auth/session-types";
import {
  getMobileSessionDiagnostics,
  isMobileSessionExpired,
  normalizeMobileSessionSnapshot,
  replaceMobileSessionUser,
  shouldRefreshMobileSession,
} from "../src/auth/session-manager";
import {
  createMobileSessionRepository,
  type MobileSecureKeyValueStorage,
} from "../src/auth/session-store";

class MemorySecureStorage implements MobileSecureKeyValueStorage {
  readonly values = new Map<string, string>();

  async deleteItemAsync(key: string) {
    this.values.delete(key);
  }

  async getItemAsync(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string) {
    this.values.set(key, value);
  }
}

function buildSession(overrides: Partial<MobileSessionSnapshot> = {}): MobileSessionSnapshot {
  const now = Date.UTC(2026, 5, 26, 12, 0, 0);

  return {
    lastValidatedAt: now,
    schemaVersion: MOBILE_SESSION_SCHEMA_VERSION,
    tokens: {
      accessToken: "access-token-1234567890",
      expiresAt: now + 60 * 60_000,
      issuedAt: now,
      refreshToken: "refresh-token-1234567890",
      scopes: ["messages:read", "messages:write"],
      tokenType: "Bearer",
    },
    user: {
      avatarUrl: "https://whispr.team/avatar.png",
      displayName: "CodeX",
      id: "user-1",
      username: "codex",
    },
    ...overrides,
  };
}

describe("mobile secure session contract", () => {
  it("normalizes valid sessions and rejects unsafe token shapes", () => {
    assert.equal(normalizeMobileSessionSnapshot(buildSession())?.user.username, "codex");

    assert.equal(
      normalizeMobileSessionSnapshot({
        ...buildSession(),
        tokens: {
          ...buildSession().tokens,
          accessToken: "short",
        },
      }),
      null,
    );
  });

  it("clears corrupted storage instead of trusting it", async () => {
    const storage = new MemorySecureStorage();
    const repository = createMobileSessionRepository(storage);
    await storage.setItemAsync("whispr.mobile.session.v1", "{not-json");

    assert.equal(await repository.load(), null);
    assert.equal(await storage.getItemAsync("whispr.mobile.session.v1"), null);
  });

  it("persists only normalized session snapshots", async () => {
    const storage = new MemorySecureStorage();
    const repository = createMobileSessionRepository(storage);
    const session = buildSession();

    await repository.save(session);
    assert.deepEqual(await repository.load(), session);

    await repository.clear();
    assert.equal(await repository.load(), null);
  });

  it("leaves a durable tombstone when deletion fails so restart cannot revive a session", async () => {
    const storage = new MemorySecureStorage();
    const repository = createMobileSessionRepository({
      deleteItemAsync: async () => {
        throw new Error("temporary keystore failure");
      },
      getItemAsync: (key) => storage.getItemAsync(key),
      setItemAsync: (key, value) => storage.setItemAsync(key, value),
    });
    await repository.save(buildSession());

    await repository.clear();

    const repositoryAfterRestart = createMobileSessionRepository(storage);
    assert.equal(await repositoryAfterRestart.load(), null);
  });

  it("computes expiry and refresh decisions with a defensive skew", () => {
    const now = Date.UTC(2026, 5, 26, 12, 0, 0);
    const almostExpired = buildSession({
      tokens: {
        ...buildSession().tokens,
        expiresAt: now + 20_000,
      },
    });
    const refreshable = buildSession({
      tokens: {
        ...buildSession().tokens,
        expiresAt: now + 4 * 60_000,
      },
    });

    assert.equal(isMobileSessionExpired(almostExpired, now), true);
    assert.equal(shouldRefreshMobileSession(refreshable, now), true);
  });

  it("diagnostics never include raw tokens or user identifiers", () => {
    const state = {
      error: null,
      session: buildSession(),
      status: "signed-in" as const,
    };
    const diagnostics = getMobileSessionDiagnostics(state, Date.UTC(2026, 5, 26, 12, 0, 0));
    const serialized = JSON.stringify(diagnostics);

    assert.equal(diagnostics.hasSession, true);
    assert.equal(diagnostics.scopeCount, 2);
    assert.equal(serialized.includes("access-token"), false);
    assert.equal(serialized.includes("refresh-token"), false);
    assert.equal(serialized.includes("user-1"), false);
  });

  it("replaces only the same user's normalized avatar while preserving the session contract", () => {
    const session = buildSession();
    const replacement = replaceMobileSessionUser(session, {
      avatarUrl: "https://cdn.whispr.team/avatars/user-1.webp",
      displayName: "Updated CodeX",
      id: "user-1",
      username: "updated_codex",
    });

    assert.deepEqual(replacement, {
      ...session,
      user: {
        avatarUrl: "https://cdn.whispr.team/avatars/user-1.webp",
        displayName: "Updated CodeX",
        id: "user-1",
        username: "updated_codex",
      },
    });
    assert.equal(replacement?.tokens, session.tokens);
    assert.equal(replacement?.schemaVersion, session.schemaVersion);
    assert.equal(replacement?.lastValidatedAt, session.lastValidatedAt);
  });

  it("fails closed for a different user and never keeps non-HTTPS avatar URLs", () => {
    const session = buildSession();

    assert.equal(
      replaceMobileSessionUser(session, {
        avatarUrl: "https://cdn.whispr.team/avatars/other.webp",
        displayName: "Other",
        id: "user-2",
        username: "other",
      }),
      null,
    );

    for (const avatarUrl of [
      "file:///private/avatar.jpg",
      "http://whispr.team/avatar.jpg",
      "bad-url",
    ]) {
      const replacement = replaceMobileSessionUser(session, {
        ...session.user,
        avatarUrl,
      });
      assert.equal(replacement?.user.avatarUrl, null);
    }
  });
});
