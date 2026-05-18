import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateWebEnvironment } from "./env";

describe("web environment validation", () => {
  it("fails closed in production when required variables are missing", () => {
    const result = validateWebEnvironment({}, "production");

    assert.match(result.missing.join(","), /AUTH_SECRET/);
    assert.match(result.missing.join(","), /DATABASE_URL/);
    assert.match(result.missing.join(","), /REDIS_URL/);
  });

  it("accepts a complete production environment", () => {
    const result = validateWebEnvironment(
      {
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
        APP_URL: "https://app.example.test",
        AUTH_SECRET: "secret",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/whispr",
        NEXTAUTH_URL: "https://app.example.test",
        NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS: "false",
        PERMISSION_CACHE_DISABLED: "false",
        REDIS_URL: "rediss://default:pass@redis.example.test:6379/0",
        SOCKET_ALLOWED_ORIGINS: "https://app.example.test",
        VOICE_PERFORMANCE_METRICS: "true",
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
        NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS: "TRUE",
        PERMISSION_CACHE_METRICS: "yes",
        REDIS_URL: "rediss://default:pass@redis.example.test:6379/0",
        SOCKET_ALLOWED_ORIGINS: "https://app.example.test",
        VOICE_PERFORMANCE_METRICS: "1",
        WORKSPACE_PERFORMANCE_METRICS: "TRUE",
        WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS: "30s",
      },
      "production",
    );

    assert.deepEqual(invalid.invalid, [
      "NEXT_PUBLIC_VOICE_PERFORMANCE_METRICS",
      "PERMISSION_CACHE_METRICS",
      "VOICE_PERFORMANCE_METRICS",
      "WORKSPACE_PERFORMANCE_METRICS",
      "WORKSPACE_PERFORMANCE_METRICS_INTERVAL_MS",
    ]);
  });
});
