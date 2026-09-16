import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthError } from "next-auth";
import { errors } from "jose";
import { authLogger } from "./auth-logger";

describe("Auth.js safe logging", () => {
  it("ignores only JWT session expiration without logging its decrypted payload", (t) => {
    const output = t.mock.method(console, "error", () => {});
    const expired = new errors.JWTExpired(
      "sensitive@example.invalid",
      { name: "Private Name" },
      "exp",
      "check_failed",
    );
    const error = new AuthError("session failed", { cause: { err: expired, ...expired.cause } });
    error.type = "JWTSessionError";
    authLogger.error(error);
    assert.equal(output.mock.callCount(), 0);
  });

  it("reports unexpected JWT and application failures without messages, stacks or payloads", (t) => {
    const output = t.mock.method(console, "error", () => {});
    for (const cause of [
      new errors.JWEDecryptionFailed("secret value"),
      new Error("private@example.invalid", { cause: { authSessionId: "private-session" } }),
      Object.assign(new Error("forged expiration"), { code: "ERR_JWT_EXPIRED" }),
    ]) {
      const error = new AuthError("session failed", { cause: { err: cause } });
      error.type = "JWTSessionError";
      authLogger.error(error);
    }
    assert.equal(output.mock.callCount(), 3);
    const text = JSON.stringify(output.mock.calls.map((call) => call.arguments));
    assert.match(text, /JWTSessionError/);
    assert.match(text, /ERR_JWE_DECRYPTION_FAILED/);
    assert.doesNotMatch(text, /secret value|private@example|private-session|forged expiration/);
  });

  it("retains non-session expiration errors and warning codes, and disables verbose debug", (t) => {
    const output = t.mock.method(console, "error", () => {});
    const warning = t.mock.method(console, "warn", () => {});
    const debug = t.mock.method(console, "log", () => {});
    authLogger.error(
      new AuthError("unexpected expiry", { cause: { err: new errors.JWTExpired("expired", {}) } }),
    );
    authLogger.warn("debug-enabled");
    authLogger.debug("sensitive", { token: "private-token" });
    assert.equal(output.mock.callCount(), 1);
    assert.equal(warning.mock.callCount(), 1);
    assert.equal(debug.mock.callCount(), 0);
  });
});
