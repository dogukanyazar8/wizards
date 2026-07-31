import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateOutboxWorkerEnvironment, validateWebEnvironment } from "./env";

const TOTP_KEY = Buffer.alloc(32, 0x44).toString("base64url");
const TOTP_ENV = {
  TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION: "v1",
  TOTP_SECRET_ENCRYPTION_KEYS: JSON.stringify({ v1: TOTP_KEY }),
};

describe("web environment validation", () => {
  it("fails closed in production when required variables are missing", () => {
    const result = validateWebEnvironment({}, "production");

    assert.match(result.missing.join(","), /AUTH_SECRET/);
    assert.match(result.missing.join(","), /DATABASE_URL/);
    assert.match(result.missing.join(","), /REDIS_URL/);
    assert.match(result.missing.join(","), /TOTP_SECRET_ENCRYPTION_KEYS/);
    assert.match(result.missing.join(","), /TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION/);
  });

  it("requires TOTP encryption keys outside production too", () => {
    for (const runtime of ["development", "test"] as const) {
      const result = validateWebEnvironment({}, runtime);
      assert.deepEqual(result.missing, [
        "TOTP_SECRET_ENCRYPTION_KEYS",
        "TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION",
      ]);
    }
  });

  it("accepts a complete production environment", () => {
    const result = validateWebEnvironment(
      {
        ...TOTP_ENV,
        APP_URL: "https://app.example.test",
        AUTH_SECRET: "secret",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/whispr",
        NEXTAUTH_URL: "https://app.example.test",
        REDIS_URL: "rediss://default:pass@redis.example.test:6379/0",
        SOCKET_ALLOWED_ORIGINS: "https://app.example.test",
      },
      "production",
    );

    assert.deepEqual(result, {
      invalid: [],
      missing: [],
    });
  });

  it("rejects conflicting auth signing secrets in production", () => {
    const result = validateWebEnvironment(
      {
        APP_URL: "https://app.example.test",
        AUTH_SECRET: "canonical-secret",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/whispr",
        NEXTAUTH_SECRET: "legacy-secret",
        NEXTAUTH_URL: "https://app.example.test",
        REDIS_URL: "rediss://default:pass@redis.example.test:6379/0",
        SOCKET_ALLOWED_ORIGINS: "https://app.example.test",
      },
      "production",
    );

    assert.deepEqual(result.invalid, ["AUTH_SECRET/NEXTAUTH_SECRET"]);
  });

  it("rejects empty-origin sockets in production", () => {
    const result = validateWebEnvironment(
      {
        APP_URL: "https://app.example.test",
        AUTH_SECRET: "secret",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/whispr",
        NEXTAUTH_URL: "https://app.example.test",
        REDIS_URL: "rediss://default:pass@redis.example.test:6379/0",
        SOCKET_ALLOWED_ORIGINS: "https://app.example.test",
        SOCKET_ALLOW_EMPTY_ORIGIN: "true",
      },
      "production",
    );

    assert.deepEqual(result.invalid, ["SOCKET_ALLOW_EMPTY_ORIGIN"]);
  });

  it("validates optional workspace performance flags", () => {
    const valid = validateWebEnvironment(
      {
        ...TOTP_ENV,
        APP_URL: "https://app.example.test",
        AUTH_SECRET: "secret",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/whispr",
        NEXTAUTH_URL: "https://app.example.test",
        NEXT_PUBLIC_VOICE_NOISE_FILTER_EXPERIMENTS: "true",
        NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS: "false",
        PERMISSION_CACHE_DISABLED: "false",
        REDIS_URL: "rediss://default:pass@redis.example.test:6379/0",
        SOCKET_ALLOWED_ORIGINS: "https://app.example.test",
        VOICE_PERFORMANCE_METRICS: "true",
        WHISPR_OUTBOX_BATCH_SIZE: "25",
        WHISPR_OUTBOX_INTERVAL_MS: "5000",
        WHISPR_OUTBOX_WORKER: "false",
        WHISPR_ADMIN_DASHBOARD_CACHE_MS: "15000",
        WHISPR_READY_CACHE_MS: "2000",
        WORKSPACE_PERFORMANCE_METRICS: "true",
        WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS: "30000",
      },
      "production",
    );

    assert.deepEqual(valid, {
      invalid: [],
      missing: [],
    });

    const invalid = validateWebEnvironment(
      {
        APP_URL: "https://app.example.test",
        AUTH_SECRET: "secret",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/whispr",
        NEXTAUTH_URL: "https://app.example.test",
        NEXT_PUBLIC_VOICE_NOISE_FILTER_EXPERIMENTS: "yes",
        NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS: "TRUE",
        PERMISSION_CACHE_METRICS: "yes",
        REDIS_URL: "rediss://default:pass@redis.example.test:6379/0",
        SOCKET_ALLOWED_ORIGINS: "https://app.example.test",
        VOICE_PERFORMANCE_METRICS: "1",
        WHISPR_OUTBOX_BATCH_SIZE: "zero",
        WHISPR_OUTBOX_INTERVAL_MS: "fast",
        WHISPR_OUTBOX_WORKER: "0",
        WHISPR_ADMIN_DASHBOARD_CACHE_MS: "later",
        WHISPR_READY_CACHE_MS: "none",
        WORKSPACE_PERFORMANCE_METRICS: "TRUE",
        WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS: "30s",
      },
      "production",
    );

    assert.deepEqual(invalid.invalid, [
      "NEXT_PUBLIC_VOICE_NOISE_FILTER_EXPERIMENTS",
      "NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS",
      "PERMISSION_CACHE_METRICS",
      "VOICE_PERFORMANCE_METRICS",
      "WHISPR_OUTBOX_WORKER",
      "WORKSPACE_PERFORMANCE_METRICS",
      "WHISPR_ADMIN_DASHBOARD_CACHE_MS",
      "WHISPR_OUTBOX_BATCH_SIZE",
      "WHISPR_OUTBOX_INTERVAL_MS",
      "WHISPR_READY_CACHE_MS",
      "WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS",
    ]);
  });

  it("rejects malformed, short, and unknown TOTP keys without returning values", () => {
    const malformed = validateWebEnvironment(
      {
        TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION: "v1",
        TOTP_SECRET_ENCRYPTION_KEYS: "{not-json",
      },
      "test",
    );
    const short = validateWebEnvironment(
      {
        TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION: "v1",
        TOTP_SECRET_ENCRYPTION_KEYS: JSON.stringify({
          v1: Buffer.alloc(16, 0x55).toString("base64url"),
        }),
      },
      "test",
    );
    const unknown = validateWebEnvironment(
      {
        TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION: "v2",
        TOTP_SECRET_ENCRYPTION_KEYS: JSON.stringify({ v1: TOTP_KEY }),
      },
      "test",
    );

    for (const result of [malformed, short, unknown]) {
      assert.deepEqual(result.invalid, ["TOTP_SECRET_ENCRYPTION_KEYS"]);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(TOTP_KEY, "u"));
    }
  });
});

describe("outbox worker environment validation", () => {
  it("requires only database and redis connectivity in production", () => {
    const result = validateOutboxWorkerEnvironment(
      {
        DATABASE_URL: "postgresql://user:pass@localhost:5432/whispr",
        REDIS_URL: "rediss://default:pass@redis.example.test:6379/0",
      },
      "production",
    );

    assert.deepEqual(result, {
      invalid: [],
      missing: [],
    });
  });

  it("does not require web-only secrets for the worker", () => {
    const result = validateOutboxWorkerEnvironment({}, "production");

    assert.deepEqual(result.missing, ["DATABASE_URL", "REDIS_URL"]);
    assert.doesNotMatch(
      result.missing.join(","),
      /AUTH_SECRET|NEXTAUTH_URL|SOCKET_ALLOWED_ORIGINS/,
    );
  });
});
