import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TurnstileVerificationError,
  assertTurnstileActionAllowed,
  assertTurnstileHostnameAllowed,
  getExpectedTurnstileHostnames,
} from "./turnstile";

describe("Turnstile hostname validation", () => {
  it("extracts expected hostnames from configured app URLs", () => {
    assert.deepEqual(
      getExpectedTurnstileHostnames({
        APP_URL: "https://app.example.test",
        AUTH_URL: "https://auth.example.test/login",
        NEXTAUTH_URL: "not-a-url",
      }),
      ["app.example.test", "auth.example.test"],
    );
  });

  it("rejects missing expected hostnames in production", () => {
    assert.throws(
      () => assertTurnstileHostnameAllowed("attacker.example", [], true),
      (error) =>
        error instanceof TurnstileVerificationError &&
        error.code === "CONFIGURATION_ERROR",
    );
  });

  it("rejects hostname mismatches", () => {
    assert.throws(
      () =>
        assertTurnstileHostnameAllowed(
          "attacker.example",
          ["app.example.test"],
          true,
        ),
      (error) =>
        error instanceof TurnstileVerificationError &&
        error.code === "ACTION_MISMATCH",
    );
  });
});

describe("Turnstile action validation", () => {
  it("accepts the expected login action", () => {
    assert.doesNotThrow(() => assertTurnstileActionAllowed("login", "login"));
  });

  it("rejects tokens issued for a different action", () => {
    assert.throws(
      () => assertTurnstileActionAllowed("register", "login"),
      (error) =>
        error instanceof TurnstileVerificationError &&
        error.code === "ACTION_MISMATCH",
    );
  });
});
