import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SECURITY_EVENT_KINDS,
  SECURITY_EVENT_LIST_LIMIT,
  listSecurityEvents,
  recordSecurityEvent,
  recordSecurityEventFromHeaders,
  serializeSecurityEvent,
  type SecurityEventDependencies,
  type SecurityEventRecord,
} from "./security-event-service";

type CreatedRow = Parameters<SecurityEventDependencies["store"]["create"]>[0];

function createDependencies(overrides: Partial<SecurityEventDependencies> = {}) {
  const created: CreatedRow[] = [];
  const listed: Array<{ limit: number; userId: string }> = [];
  const logged: Array<{ error: unknown; scope: string }> = [];

  const dependencies: SecurityEventDependencies = {
    // A stand-in for the salted sha256: one-way, so the raw address cannot survive inside it.
    hashIp: (value) => (value ? "d".repeat(64) : null),
    logError: ((scope: string, error: unknown) => {
      logged.push({ error, scope });
    }) as SecurityEventDependencies["logError"],
    store: {
      create: async (input) => {
        created.push(input);
        return { id: "event-1" };
      },
      list: async (userId, limit) => {
        listed.push({ limit, userId });
        return [];
      },
    },
    ...overrides,
  };

  return { created, dependencies, listed, logged };
}

const headersOf = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("security event service", () => {
  it("keeps the kind list closed at the eight kinds this stripe writes", () => {
    assert.deepEqual(
      [...SECURITY_EVENT_KINDS],
      [
        "LOGIN_NEW_DEVICE",
        "PASSWORD_CHANGED",
        "FAILED_LOGIN",
        "TWO_FACTOR_ENABLED",
        "TWO_FACTOR_DISABLED",
        "SESSION_REVOKED",
        "RECOVERY_CODES_REGENERATED",
        "EMAIL_CHANGED",
      ],
    );
  });

  it("stores a salted hash and never the raw address", async () => {
    const { created, dependencies } = createDependencies();

    await recordSecurityEvent(
      {
        ip: "203.0.113.7",
        kind: "PASSWORD_CHANGED",
        location: "TR",
        userAgent: "Chrome 140",
        userId: "user-1",
      },
      dependencies,
    );

    assert.equal(created.length, 1);
    assert.equal(created[0]?.ipHash, "d".repeat(64));
    assert.equal(JSON.stringify(created[0]).includes("203.0.113.7"), false);
  });

  it("bounds the stored user agent and location", async () => {
    const { created, dependencies } = createDependencies();

    await recordSecurityEvent(
      {
        kind: "LOGIN_NEW_DEVICE",
        location: "x".repeat(200),
        userAgent: "u".repeat(4000),
        userId: "user-1",
      },
      dependencies,
    );

    assert.equal(created[0]?.userAgent?.length, 256);
    assert.equal(created[0]?.location?.length, 64);
    assert.equal(created[0]?.ipHash, null);
  });

  it("swallows a write failure so the calling flow survives", async () => {
    const { dependencies, logged } = createDependencies({
      store: {
        create: async () => {
          throw new Error("security log is down");
        },
        list: async () => [],
      },
    });

    await assert.doesNotReject(() =>
      recordSecurityEvent({ kind: "FAILED_LOGIN", userId: "user-1" }, dependencies),
    );
    assert.equal(logged.length, 1);
    assert.equal(logged[0]?.scope, "[security] Failed to record FAILED_LOGIN security event");
  });

  it("ignores a blank user id instead of writing an orphan row", async () => {
    const { created, dependencies } = createDependencies();

    await recordSecurityEvent({ kind: "SESSION_REVOKED", userId: "   " }, dependencies);

    assert.deepEqual(created, []);
  });

  it("derives the hash, country guess and device from request headers", async () => {
    const { created, dependencies } = createDependencies();
    process.env.TRUSTED_PROXY_HOPS = "1";
    process.env.ANALYTICS_HASH_SECRET = "test-salt";

    try {
      await recordSecurityEventFromHeaders(
        headersOf({
          "cf-ipcountry": "TR",
          "user-agent": "Mozilla/5.0 Chrome/140",
          "x-forwarded-for": "203.0.113.9",
        }),
        { kind: "LOGIN_NEW_DEVICE", userId: "user-1" },
        dependencies,
      );
    } finally {
      delete process.env.TRUSTED_PROXY_HOPS;
      delete process.env.ANALYTICS_HASH_SECRET;
    }

    assert.equal(created.length, 1);
    assert.equal(created[0]?.location, "TR");
    assert.equal(created[0]?.userAgent, "Mozilla/5.0 Chrome/140");
    assert.match(String(created[0]?.ipHash), /^[0-9a-f]{64}$/);
    assert.equal(String(created[0]?.ipHash).includes("203.0.113.9"), false);
  });

  it("still writes the row when there are no headers to read", async () => {
    const { created, dependencies } = createDependencies();

    await recordSecurityEventFromHeaders(
      null,
      { kind: "TWO_FACTOR_ENABLED", userId: "user-1" },
      dependencies,
    );

    assert.equal(created.length, 1);
    assert.equal(created[0]?.ipHash, null);
    assert.equal(created[0]?.location, null);
  });

  it("caps the list at ten rows however the caller asks", async () => {
    const { dependencies, listed } = createDependencies();

    await listSecurityEvents("user-1", 500, dependencies);
    await listSecurityEvents("user-1", 0, dependencies);
    await listSecurityEvents("user-1", undefined, dependencies);

    assert.deepEqual(
      listed.map(({ limit }) => limit),
      [SECURITY_EVENT_LIST_LIMIT, 1, SECURITY_EVENT_LIST_LIMIT],
    );
  });

  it("serializes to wire casing without the hash", () => {
    const record: SecurityEventRecord = {
      createdAt: new Date("2026-08-24T09:00:00.000Z"),
      id: "event-1",
      kind: "RECOVERY_CODES_REGENERATED",
      location: "TR",
      userAgent: "Chrome 140",
    };

    assert.deepEqual(serializeSecurityEvent(record), {
      createdAt: "2026-08-24T09:00:00.000Z",
      id: "event-1",
      kind: "recoveryCodesRegenerated",
      location: "TR",
      userAgent: "Chrome 140",
    });
  });

  it("maps every schema kind to a distinct wire kind", () => {
    const wire = SECURITY_EVENT_KINDS.map((kind) =>
      serializeSecurityEvent({
        createdAt: new Date(0),
        id: kind,
        kind,
        location: null,
        userAgent: null,
      }),
    ).map((event) => event.kind);

    assert.equal(new Set(wire).size, SECURITY_EVENT_KINDS.length);
    assert.equal(
      wire.every((value) => /^[a-z][A-Za-z]*$/.test(value)),
      true,
    );
  });
});
