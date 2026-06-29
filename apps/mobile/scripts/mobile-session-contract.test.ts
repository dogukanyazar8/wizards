import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MOBILE_SESSION_SCHEMA_VERSION, type MobileSessionSnapshot } from "../src/auth/session-types";
import {
  getMobileSessionDiagnostics,
  isMobileSessionExpired,
  normalizeMobileSessionSnapshot,
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
});
