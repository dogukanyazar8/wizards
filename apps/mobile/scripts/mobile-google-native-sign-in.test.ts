import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMobileGoogleCancellation,
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

  it("falls back when the native path cannot run on this device or build", async () => {
    const withoutClientId = await runMobileGoogleNativeSignIn({
      client: createClient(),
      webClientId: null,
    });
    const withoutModule = await runMobileGoogleNativeSignIn({ client: null, webClientId });
    const withoutPlayServices = await runMobileGoogleNativeSignIn({
      client: createClient({ hasPlayServices: async () => false }),
      webClientId,
    });
    const nativeModuleMissing = await runMobileGoogleNativeSignIn({
      client: createClient({
        configure: () => {
          throw new Error("native module is not linked");
        },
      }),
      webClientId,
    });

    for (const outcome of [
      withoutClientId,
      withoutModule,
      withoutPlayServices,
      nativeModuleMissing,
    ]) {
      assert.deepEqual(outcome, { reason: "unavailable", type: "failed" });
    }
  });

  it("fails loudly when the sheet succeeds without an ID token", async () => {
    const outcome = await runMobileGoogleNativeSignIn({
      client: createClient({ signIn: async () => ({ data: { idToken: null }, type: "success" }) }),
      webClientId,
    });

    assert.deepEqual(outcome, { reason: "no-id-token", type: "failed" });
  });

  it("recognizes the legacy cancellation codes only", () => {
    assert.equal(isMobileGoogleCancellation({ code: "12501" }), true);
    assert.equal(isMobileGoogleCancellation({ code: "SIGN_IN_CANCELLED" }), true);
    assert.equal(isMobileGoogleCancellation({ code: "PLAY_SERVICES_NOT_AVAILABLE" }), false);
    assert.equal(isMobileGoogleCancellation(new Error("boom")), false);
    assert.equal(isMobileGoogleCancellation(null), false);
  });
});
