import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatErrorLog, formatWarningLog } from "./logger";

describe("structured logger", () => {
  it("preserves non-PII email metadata and approved diagnostic hashes", () => {
    const payload = JSON.parse(
      formatWarningLog(
        "auth:metadata",
        {
          emailVerified: true,
          emailVerifiedAt: "2026-05-14T00:00:00.000Z",
          emailStatus: "verified",
          hasEmail: true,
          userAgentHash: "user-agent-hash",
          ipAddressHash: "ip-address-hash",
          passwordHash: "credential-hash",
        },
        new Date("2026-05-14T00:00:00.000Z"),
      ),
    ) as {
      error: {
        emailStatus: string;
        emailVerified: boolean;
        emailVerifiedAt: string;
        hasEmail: boolean;
        ipAddressHash: string;
        passwordHash: string;
        userAgentHash: string;
      };
    };

    assert.deepEqual(payload.error, {
      emailVerified: true,
      emailVerifiedAt: "2026-05-14T00:00:00.000Z",
      emailStatus: "verified",
      hasEmail: true,
      userAgentHash: "user-agent-hash",
      ipAddressHash: "ip-address-hash",
      passwordHash: "[redacted]",
    });
  });

  it("redacts exact PII keys and common camelCase and snake_case variants", () => {
    const payload = JSON.parse(
      formatErrorLog(
        "request:metadata",
        {
          email: "a@b.com",
          emailAddress: "person@example.com",
          email_address: "snake@example.com",
          ip: "1.2.3.4",
          ipAddress: "5.6.7.8",
          ip_address: "9.10.11.12",
          userAgent: "Mozilla/5.0",
          user_agent: "Whispr-Test-Agent",
          validationMessage: "invalid email format",
        },
        new Date("2026-05-14T00:00:00.000Z"),
      ),
    ) as { error: Record<string, unknown> };

    assert.deepEqual(payload.error, {
      email: "[redacted]",
      emailAddress: "[redacted]",
      email_address: "[redacted]",
      ip: "[redacted]",
      ipAddress: "[redacted]",
      ip_address: "[redacted]",
      userAgent: "[redacted]",
      user_agent: "[redacted]",
      validationMessage: "invalid email format",
    });
  });

  it("redacts PII recursively inside objects and arrays", () => {
    const payload = JSON.parse(
      formatWarningLog(
        "request:nested",
        {
          request: {
            email: "nested@example.com",
          },
          attempts: [
            { ipAddress: "1.2.3.4", outcome: "rejected" },
            { user_agent: "Nested-Agent", outcome: "accepted" },
          ],
        },
        new Date("2026-05-14T00:00:00.000Z"),
      ),
    ) as {
      error: {
        attempts: Array<Record<string, unknown>>;
        request: Record<string, unknown>;
      };
    };

    assert.deepEqual(payload.error, {
      request: {
        email: "[redacted]",
      },
      attempts: [
        { ipAddress: "[redacted]", outcome: "rejected" },
        { user_agent: "[redacted]", outcome: "accepted" },
      ],
    });
  });

  it("formats errors as redacted JSON log entries", () => {
    const payload = JSON.parse(
      formatErrorLog(
        "auth:token",
        {
          password: "secret",
          recoveryCode: "ABCDE-FGHIJ-KLMNO-PQRST",
          twoFactorSecret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
          token: "eyJaaaaaaaaaaaaaaaaaaaa.eyJbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc",
          error: new Error("failed with sk_test_1234567890abcdef"),
        },
        new Date("2026-05-14T00:00:00.000Z"),
      ),
    ) as {
      error: {
        error: {
          message: string;
        };
        password: string;
        recoveryCode: string;
        twoFactorSecret: string;
        token: string;
      };
      level: string;
      scope: string;
      timestamp: string;
    };

    assert.equal(payload.timestamp, "2026-05-14T00:00:00.000Z");
    assert.equal(payload.level, "error");
    assert.equal(payload.scope, "auth:token");
    assert.equal(payload.error.password, "[redacted]");
    assert.equal(payload.error.recoveryCode, "[redacted]");
    assert.equal(payload.error.twoFactorSecret, "[redacted]");
    assert.equal(payload.error.token, "[redacted]");
    assert.equal(payload.error.error.message, "failed with [redacted-secret]");
  });

  it("serializes BigInt values without breaking the log line", () => {
    const payload = JSON.parse(
      formatErrorLog("metrics", { uploadedBytes: 123n }, new Date("2026-05-14T00:00:00.000Z")),
    ) as { error: { uploadedBytes: string } };

    assert.equal(payload.error.uploadedBytes, "123");
  });

  it("formats warnings with the same redaction rules as errors", () => {
    const payload = JSON.parse(
      formatWarningLog(
        "voice:metadata",
        { token: "secret-token", error: new Error("timeout for sk_test_1234567890abcdef") },
        new Date("2026-05-14T00:00:00.000Z"),
      ),
    ) as {
      error: {
        error: {
          message: string;
        };
        token: string;
      };
      level: string;
      scope: string;
    };

    assert.equal(payload.level, "warn");
    assert.equal(payload.scope, "voice:metadata");
    assert.equal(payload.error.token, "[redacted]");
    assert.equal(payload.error.error.message, "timeout for [redacted-secret]");
  });
});
