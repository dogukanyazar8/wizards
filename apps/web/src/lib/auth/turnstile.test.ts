import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TurnstileVerificationError,
  assertTurnstileActionAllowed,
  assertTurnstileHostnameAllowed,
  getExpectedTurnstileHostnames,
  verifyTurnstileToken,
} from "./turnstile";
import {
  E2E_TURNSTILE_TOKEN,
  isE2ETurnstileBypassEnabled,
} from "./turnstile-e2e";

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

describe("Turnstile E2E bypass", () => {
  it("reports the bypass as enabled only for non-production E2E runs", () => {
    assert.equal(
      isE2ETurnstileBypassEnabled({
        NEXT_PUBLIC_E2E_TEST_MODE: "true",
        NODE_ENV: "test",
      }),
      true,
    );
    assert.equal(
      isE2ETurnstileBypassEnabled({
        NEXT_PUBLIC_E2E_TEST_MODE: "true",
        NODE_ENV: "production",
      }),
      false,
    );
  });

  it("uses the public E2E env without a dynamic env argument", () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalEnv = {
      NEXT_PUBLIC_E2E_TEST_MODE: mutableEnv.NEXT_PUBLIC_E2E_TEST_MODE,
      NODE_ENV: mutableEnv.NODE_ENV,
    };

    try {
      mutableEnv.NEXT_PUBLIC_E2E_TEST_MODE = "true";
      mutableEnv.NODE_ENV = "test";
      assert.equal(isE2ETurnstileBypassEnabled(), true);

      mutableEnv.NODE_ENV = "production";
      assert.equal(isE2ETurnstileBypassEnabled(), false);
    } finally {
      if (originalEnv.NEXT_PUBLIC_E2E_TEST_MODE === undefined) {
        delete mutableEnv.NEXT_PUBLIC_E2E_TEST_MODE;
      } else {
        mutableEnv.NEXT_PUBLIC_E2E_TEST_MODE = originalEnv.NEXT_PUBLIC_E2E_TEST_MODE;
      }
      if (originalEnv.NODE_ENV === undefined) {
        delete mutableEnv.NODE_ENV;
      } else {
        mutableEnv.NODE_ENV = originalEnv.NODE_ENV;
      }
    }
  });

  it("accepts the deterministic E2E token without calling Cloudflare", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalEnv = {
      E2E_TEST_MODE: mutableEnv.E2E_TEST_MODE,
      NODE_ENV: mutableEnv.NODE_ENV,
    };
    const originalFetch = globalThis.fetch;
    let calledFetch = false;

    mutableEnv.E2E_TEST_MODE = "true";
    mutableEnv.NODE_ENV = "test";
    globalThis.fetch = (() => {
      calledFetch = true;
      throw new Error("fetch should not be called for the E2E token");
    }) as typeof fetch;

    try {
      assert.equal(await verifyTurnstileToken(E2E_TURNSTILE_TOKEN), true);
      assert.equal(calledFetch, false);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv.E2E_TEST_MODE === undefined) {
        delete mutableEnv.E2E_TEST_MODE;
      } else {
        mutableEnv.E2E_TEST_MODE = originalEnv.E2E_TEST_MODE;
      }
      if (originalEnv.NODE_ENV === undefined) {
        delete mutableEnv.NODE_ENV;
      } else {
        mutableEnv.NODE_ENV = originalEnv.NODE_ENV;
      }
    }
  });
});
