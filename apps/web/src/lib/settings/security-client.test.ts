import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthSession } from "@wizards/types";

import {
  SECURITY_EVENTS_ENDPOINT,
  SecurityClientError,
  STATIC_CONNECTIONS,
  changePassword,
  fetchAccountSessions,
  fetchConnections,
  fetchSecurityEvents,
  matchesDeletionConfirmation,
  revokeOtherAccountSessions,
  toAccountSession,
  toAccountSessionPlatform,
} from "./security-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function authSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    appVersion: null,
    browser: "Chrome 140",
    clientType: "WEB",
    countryCode: "TR",
    createdAt: "2026-08-24T08:00:00.000Z",
    current: true,
    deviceType: "DESKTOP",
    expiresAt: "2026-09-24T08:00:00.000Z",
    id: "session-1",
    lastSeenAt: "2026-08-24T09:00:00.000Z",
    os: "Windows 11",
    ...overrides,
  };
}

describe("security client — events", () => {
  it("parses the ten-row log and refuses a longer one", async () => {
    const events = await fetchSecurityEvents((async (url: string) => {
      assert.equal(url, SECURITY_EVENTS_ENDPOINT);
      return jsonResponse({
        events: [
          {
            createdAt: "2026-08-24T09:00:00.000Z",
            id: "e1",
            kind: "passwordChanged",
            location: "TR",
            userAgent: "Chrome 140",
          },
        ],
      });
    }) as unknown as typeof fetch);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "passwordChanged");

    await assert.rejects(() =>
      fetchSecurityEvents((async () =>
        jsonResponse({
          events: Array.from({ length: 11 }, (_, index) => ({
            createdAt: "2026-08-24T09:00:00.000Z",
            id: `e${index}`,
            kind: "failedLogin",
            location: null,
            userAgent: null,
          })),
        })) as unknown as typeof fetch),
    );
  });

  it("surfaces the server error code", async () => {
    await assert.rejects(
      () =>
        fetchSecurityEvents((async () =>
          jsonResponse({ code: "RATE_LIMITED" }, 429)) as unknown as typeof fetch),
      (error: unknown) =>
        error instanceof SecurityClientError &&
        error.code === "RATE_LIMITED" &&
        error.status === 429,
    );
  });
});

describe("security client — sessions", () => {
  it("derives the web/desktop split the design draws from clientType", () => {
    assert.equal(toAccountSessionPlatform("WEB"), "web");
    assert.equal(toAccountSessionPlatform("DESKTOP"), "desktop");
    assert.equal(toAccountSessionPlatform("MOBILE"), "mobile");
    assert.equal(toAccountSessionPlatform("UNKNOWN"), "web");
  });

  it("keeps `current` and builds a device label from the stored columns", () => {
    const mapped = toAccountSession(authSession());

    assert.equal(mapped.current, true);
    assert.equal(mapped.platform, "web");
    assert.equal(mapped.device, "Chrome 140 · Windows 11");
    assert.equal(mapped.location, "TR");
    assert.equal(mapped.lastActive, "2026-08-24T09:00:00.000Z");
  });

  it("falls back to the device type when browser and os are unknown", () => {
    const mapped = toAccountSession(
      authSession({ browser: null, current: false, os: null, clientType: "DESKTOP" }),
    );

    assert.equal(mapped.device, "DESKTOP");
    assert.equal(mapped.os, "DESKTOP");
    assert.equal(mapped.current, false);
    assert.equal(mapped.platform, "desktop");
  });

  it("maps the whole list and reports the revoked count", async () => {
    const sessions = await fetchAccountSessions((async () =>
      jsonResponse({
        sessions: [authSession(), authSession({ clientType: "DESKTOP", current: false, id: "s2" })],
      })) as unknown as typeof fetch);

    assert.deepEqual(
      sessions.map(({ current, platform }) => ({ current, platform })),
      [
        { current: true, platform: "web" },
        { current: false, platform: "desktop" },
      ],
    );

    assert.equal(
      await revokeOtherAccountSessions((async () =>
        jsonResponse({ revokedCount: 3 })) as unknown as typeof fetch),
      3,
    );
  });
});

describe("security client — password", () => {
  it("carries the failing policy rules onto the error", async () => {
    await assert.rejects(
      () =>
        changePassword(
          { confirmPassword: "weak", currentPassword: "x", newPassword: "weak" },
          (async () =>
            jsonResponse(
              { code: "WEAK_PASSWORD", failedRules: ["length", "digit"] },
              400,
            )) as unknown as typeof fetch,
        ),
      (error: unknown) =>
        error instanceof SecurityClientError &&
        error.code === "WEAK_PASSWORD" &&
        error.failedRules.join(",") === "length,digit",
    );
  });

  it("returns the change stamp and how many sessions closed", async () => {
    const result = await changePassword(
      {
        confirmPassword: "Brand-New-Secret-2",
        currentPassword: "Old-Secret-1",
        newPassword: "Brand-New-Secret-2",
      },
      (async () =>
        jsonResponse({
          changedAt: "2026-08-24T09:00:00.000Z",
          revokedOtherSessions: 2,
          success: true,
        })) as unknown as typeof fetch,
    );

    assert.deepEqual(result, {
      changedAt: "2026-08-24T09:00:00.000Z",
      revokedOtherSessions: 2,
    });
  });
});

describe("security client — deletion phrase", () => {
  it("compares the typed sentence against the localised phrase", () => {
    const phrase = "hesabımı kalıcı olarak sil";

    assert.equal(matchesDeletionConfirmation("hesabımı kalıcı olarak sil", phrase), true);
    assert.equal(matchesDeletionConfirmation("  Hesabımı Kalıcı Olarak Sil  ", phrase), true);
    assert.equal(matchesDeletionConfirmation("hesabimi kalici olarak sil", phrase), false);
    assert.equal(matchesDeletionConfirmation("", phrase), false);
  });
});

describe("security client — connections (K5)", () => {
  it("resolves four disabled rows without calling any endpoint", async () => {
    const connections = await fetchConnections();

    assert.deepEqual(
      connections.map(({ available, connected, service }) => ({
        available,
        connected,
        service,
      })),
      [
        { available: false, connected: false, service: "github" },
        { available: false, connected: false, service: "spotify" },
        { available: false, connected: false, service: "steam" },
        { available: false, connected: false, service: "xbox" },
      ],
    );
  });

  it("hands out copies so a caller cannot mutate the static table", async () => {
    const first = await fetchConnections();
    first[0]!.connected = true;

    assert.equal(STATIC_CONNECTIONS[0]?.connected, false);
    assert.equal((await fetchConnections())[0]?.connected, false);
  });
});
