import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatErrorLog, formatWarningLog } from "./logger";

describe("structured logger", () => {
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
