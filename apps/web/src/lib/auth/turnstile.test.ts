import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TurnstileVerificationError,
  assertTurnstileActionAllowed,
  assertTurnstileHostnameAllowed,
  getExpectedTurnstileHostnames,
  verifyTurnstileToken,
} from "./turnstile";
import { E2E_TURNSTILE_TOKEN, isE2ETurnstileBypassEnabled } from "./turnstile-e2e";

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
        error instanceof TurnstileVerificationError && error.code === "CONFIGURATION_ERROR",
    );
  });

  it("rejects hostname mismatches", () => {
    assert.throws(
      () => assertTurnstileHostnameAllowed("attacker.example", ["app.example.test"], true),
      (error) => error instanceof TurnstileVerificationError && error.code === "ACTION_MISMATCH",
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
      (error) => error instanceof TurnstileVerificationError && error.code === "ACTION_MISMATCH",
    );
  });
});

describe("Turnstile local test credentials", () => {
  it("accepts Cloudflare's successful dummy response during local development", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalEnv = {
      APP_URL: mutableEnv.APP_URL,
      NODE_ENV: mutableEnv.NODE_ENV,
      TURNSTILE_SECRET_KEY: mutableEnv.TURNSTILE_SECRET_KEY,
    };
    const originalFetch = globalThis.fetch;

    mutableEnv.APP_URL = "http://localhost:3000";
    mutableEnv.NODE_ENV = "development";
    mutableEnv.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          hostname: "example.com",
        }),
        { status: 200 },
      )) as typeof fetch;

    try {
      assert.equal(
        await verifyTurnstileToken("XXXX.DUMMY.TOKEN.XXXX", undefined, {
          expectedAction: "login",
          requestUrl: "http://localhost:3000/login",
        }),
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete mutableEnv[key];
        } else {
          mutableEnv[key] = value;
        }
      }
    }
  });

  it("rejects Cloudflare's public dummy secret in production", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalEnv = {
      APP_URL: mutableEnv.APP_URL,
      NODE_ENV: mutableEnv.NODE_ENV,
      TURNSTILE_SECRET_KEY: mutableEnv.TURNSTILE_SECRET_KEY,
    };
    const originalFetch = globalThis.fetch;

    mutableEnv.APP_URL = "https://app.example.test";
    mutableEnv.NODE_ENV = "production";
    mutableEnv.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          hostname: "app.example.test",
        }),
        { status: 200 },
      )) as typeof fetch;

    try {
      await assert.rejects(
        () => verifyTurnstileToken("XXXX.DUMMY.TOKEN.XXXX"),
        (error) =>
          error instanceof TurnstileVerificationError && error.code === "CONFIGURATION_ERROR",
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete mutableEnv[key];
        } else {
          mutableEnv[key] = value;
        }
      }
    }
  });
});

describe("Turnstile E2E bypass", () => {
  it("rejects the deterministic bypass token on a non-local request host", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalEnv = {
      APP_URL: mutableEnv.APP_URL,
      E2E_TEST_MODE: mutableEnv.E2E_TEST_MODE,
      NODE_ENV: mutableEnv.NODE_ENV,
    };

    try {
      mutableEnv.APP_URL = "http://localhost:3000";
      mutableEnv.E2E_TEST_MODE = "true";
      mutableEnv.NODE_ENV = "test";

      await assert.rejects(() =>
        verifyTurnstileToken(E2E_TURNSTILE_TOKEN, undefined, {
          requestUrl: "https://attacker.example/forgot-password",
        }),
      );
    } finally {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete mutableEnv[key];
        } else {
          mutableEnv[key] = value;
        }
      }
    }
  });

  it("reports the bypass as enabled only for approved E2E runs", () => {
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
    assert.equal(
      isE2ETurnstileBypassEnabled({
        NEXT_PUBLIC_E2E_ALLOW_PRODUCTION_BUILD: "true",
        NEXT_PUBLIC_E2E_TEST_MODE: "true",
        NODE_ENV: "production",
      }),
      true,
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
      assert.equal(
        await verifyTurnstileToken(E2E_TURNSTILE_TOKEN, undefined, {
          requestUrl: "http://localhost/register",
        }),
        true,
      );
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

  it("accepts the deterministic E2E token in an explicitly approved production test build", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalEnv = {
      E2E_ALLOW_PRODUCTION_BUILD: mutableEnv.E2E_ALLOW_PRODUCTION_BUILD,
      E2E_TEST_MODE: mutableEnv.E2E_TEST_MODE,
      NODE_ENV: mutableEnv.NODE_ENV,
    };
    const originalFetch = globalThis.fetch;
    let calledFetch = false;

    mutableEnv.E2E_ALLOW_PRODUCTION_BUILD = "true";
    mutableEnv.E2E_TEST_MODE = "true";
    mutableEnv.NODE_ENV = "production";
    globalThis.fetch = (() => {
      calledFetch = true;
      throw new Error("fetch should not be called for the approved production E2E token");
    }) as typeof fetch;

    try {
      assert.equal(
        await verifyTurnstileToken(E2E_TURNSTILE_TOKEN, undefined, {
          requestUrl: "http://localhost/register",
        }),
        true,
      );
      assert.equal(calledFetch, false);
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete mutableEnv[key];
        } else {
          mutableEnv[key] = value;
        }
      }
    }
  });
});
