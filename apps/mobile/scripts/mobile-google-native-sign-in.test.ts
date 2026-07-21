import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMobileGoogleCancellation,
  isMobileGoogleDeveloperError,
  runMobileGoogleNativeSignIn,
  type MobileGoogleNativeSignInClient,
} from "../src/auth/mobile-google-native-sign-in";

const webClientId = "1234567890-whispr.apps.googleusercontent.com";
const idToken = "header.payload.signature";

function createClient(
  overrides: Partial<MobileGoogleNativeSignInClient> = {},
): MobileGoogleNativeSignInClient & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    configure: () => {
      calls.push("configure");
    },
    hasPlayServices: async () => {
      calls.push("hasPlayServices");
      return true;
    },
    signIn: async () => {
      calls.push("signIn");
      return { data: { idToken }, type: "success" };
    },
    signOut: async () => {
      calls.push("signOut");
      return null;
    },
    ...overrides,
  };
}

describe("mobile native Google sign-in", () => {
  it("returns only the ID token after the on-device account sheet succeeds", async () => {
    const client = createClient();
    const outcome = await runMobileGoogleNativeSignIn({ client, webClientId });

    assert.deepEqual(outcome, { idToken, type: "signed-in" });
    assert.deepEqual(client.calls, ["configure", "hasPlayServices", "signOut", "signIn"]);
  });

  it("clears the cached account first so the picker always appears", async () => {
    const client = createClient({
      signOut: async () => {
        throw new Error("nothing cached");
      },
    });

    assert.deepEqual(await runMobileGoogleNativeSignIn({ client, webClientId }), {
      idToken,
      type: "signed-in",
    });
  });

  it("reports cancellation for both the resolved and the thrown variants", async () => {
    const resolved = await runMobileGoogleNativeSignIn({
      client: createClient({ signIn: async () => ({ type: "cancelled" }) }),
      webClientId,
    });
    const thrown = await runMobileGoogleNativeSignIn({
      client: createClient({
        signIn: async () => {
          throw Object.assign(new Error("cancelled"), { code: "SIGN_IN_CANCELLED" });
        },
      }),
      webClientId,
    });

    assert.deepEqual(resolved, { type: "cancelled" });
    assert.deepEqual(thrown, { type: "cancelled" });
  });

  it("separates the fallback causes so a build problem is not read as a device problem", async () => {
    const cases: Array<[string, Awaited<ReturnType<typeof runMobileGoogleNativeSignIn>>]> = [
      [
        "not-configured",
        await runMobileGoogleNativeSignIn({ client: createClient(), webClientId: null }),
      ],
      ["module-missing", await runMobileGoogleNativeSignIn({ client: null, webClientId })],
      [
        "module-missing",
        await runMobileGoogleNativeSignIn({
          client: createClient({
            configure: () => {
              throw new Error("native module is not linked");
            },
          }),
          webClientId,
        }),
      ],
      [
        "play-services-unavailable",
        await runMobileGoogleNativeSignIn({
          client: createClient({ hasPlayServices: async () => false }),
          webClientId,
        }),
      ],
      [
        "developer-error",
        await runMobileGoogleNativeSignIn({
          client: createClient({
            signIn: async () => {
              throw Object.assign(new Error("developer error"), { code: 10 });
            },
          }),
          webClientId,
        }),
      ],
      [
        "sign-in-error",
        await runMobileGoogleNativeSignIn({
          client: createClient({
            signIn: async () => {
              throw new Error("network unreachable");
            },
          }),
          webClientId,
        }),
      ],
      [
        "no-id-token",
        await runMobileGoogleNativeSignIn({
          client: createClient({
            signIn: async () => ({ data: { idToken: null }, type: "success" }),
          }),
          webClientId,
        }),
      ],
    ];

    for (const [expectedReason, outcome] of cases) {
      assert.equal(outcome.type, "failed");
      assert.equal(outcome.type === "failed" ? outcome.reason : null, expectedReason);
    }
  });

  it("reports every non-cancellation failure to the caller for diagnostics", async () => {
    const failures: Array<{ detail?: string; reason: string }> = [];

    await runMobileGoogleNativeSignIn({
      client: createClient(),
      onFailure: (failure) => failures.push(failure),
      webClientId: null,
    });
    await runMobileGoogleNativeSignIn({
      client: createClient({ signIn: async () => ({ type: "cancelled" }) }),
      onFailure: (failure) => failures.push(failure),
      webClientId,
    });

    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.reason, "not-configured");
    assert.match(failures[0]?.detail ?? "", /EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID/);
  });

  it("recognizes the legacy cancellation codes only", () => {
    assert.equal(isMobileGoogleCancellation({ code: "12501" }), true);
    assert.equal(isMobileGoogleCancellation({ code: 12501 }), true);
    assert.equal(isMobileGoogleCancellation({ code: "SIGN_IN_CANCELLED" }), true);
    assert.equal(isMobileGoogleCancellation({ code: "PLAY_SERVICES_NOT_AVAILABLE" }), false);
    assert.equal(isMobileGoogleCancellation(new Error("boom")), false);
    assert.equal(isMobileGoogleCancellation(null), false);
  });

  it("recognizes the signature/package mismatch code in both shapes", () => {
    assert.equal(isMobileGoogleDeveloperError({ code: 10 }), true);
    assert.equal(isMobileGoogleDeveloperError({ code: "DEVELOPER_ERROR" }), true);
    assert.equal(isMobileGoogleDeveloperError({ code: "SIGN_IN_CANCELLED" }), false);
    assert.equal(isMobileGoogleDeveloperError(null), false);
  });
});
