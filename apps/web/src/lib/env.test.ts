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
});
