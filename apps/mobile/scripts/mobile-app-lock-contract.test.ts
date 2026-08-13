import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createMobileAppLockPreferenceStore,
  MOBILE_APP_LOCK_PREFERENCE_KEY,
  type MobileAppLockPreferenceStore,
} from "../src/auth/mobile-app-lock-preference-store";
import {
  assessMobileAppLockAvailability,
  runMobileAppLockAuthentication,
  shouldArmMobileAppLock,
  type MobileBiometricAuthenticator,
} from "../src/security/mobile-app-lock";
import type { MobileSecureKeyValueStorage } from "../src/auth/session-store";

function createAuthenticator(input: {
  authenticateResult?: boolean;
  authenticateError?: Error;
  hasHardware?: boolean;
  hasHardwareError?: Error;
  isEnrolled?: boolean;
}): MobileBiometricAuthenticator {
  return {
    async authenticate() {
      if (input.authenticateError) {
        throw input.authenticateError;
      }

      return { success: input.authenticateResult ?? false };
    },
    async hasHardware() {
      if (input.hasHardwareError) {
        throw input.hasHardwareError;
      }

      return input.hasHardware ?? true;
    },
    async isEnrolled() {
      return input.isEnrolled ?? true;
    },
  };
}

function createMemoryStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));

  const storage: MobileSecureKeyValueStorage = {
    async deleteItemAsync(key) {
      map.delete(key);
    },
    async getItemAsync(key) {
      return map.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      map.set(key, value);
    },
  };

  return { map, storage };
}

const PROMPT_OPTIONS = {
  cancelLabel: "Iptal",
  disableDeviceFallback: false,
  fallbackLabel: "Cihaz parolasi",
  promptMessage: "Kimligini dogrula",
};

describe("mobile app lock availability", () => {
  it("reports available only when hardware exists and biometrics are enrolled", async () => {
    assert.equal(
      await assessMobileAppLockAvailability(
        createAuthenticator({ hasHardware: true, isEnrolled: true }),
      ),
      "available",
    );
  });

  it("reports unavailable when the device has no biometric hardware", async () => {
    assert.equal(
      await assessMobileAppLockAvailability(createAuthenticator({ hasHardware: false })),
      "unavailable",
    );
  });

  it("reports unavailable when no biometrics are enrolled", async () => {
    assert.equal(
      await assessMobileAppLockAvailability(
        createAuthenticator({ hasHardware: true, isEnrolled: false }),
      ),
      "unavailable",
    );
  });

  it("fails open to unavailable when the native capability check throws", async () => {
    assert.equal(
      await assessMobileAppLockAvailability(
        createAuthenticator({ hasHardwareError: new Error("native detail") }),
      ),
      "unavailable",
    );
  });
});

describe("mobile app lock arming decision", () => {
  it("arms only for a signed-in user who enabled the lock on a capable device", () => {
    assert.equal(
      shouldArmMobileAppLock({
        availability: "available",
        preferenceEnabled: true,
        signedIn: true,
      }),
      true,
    );
  });

  it("never arms when the preference is disabled", () => {
    assert.equal(
      shouldArmMobileAppLock({
        availability: "available",
        preferenceEnabled: false,
        signedIn: true,
      }),
      false,
    );
  });

  it("never arms when signed out", () => {
    assert.equal(
      shouldArmMobileAppLock({
        availability: "available",
        preferenceEnabled: true,
        signedIn: false,
      }),
      false,
    );
  });

  it("fails open and never arms when biometrics are unavailable", () => {
    assert.equal(
      shouldArmMobileAppLock({
        availability: "unavailable",
        preferenceEnabled: true,
        signedIn: true,
      }),
      false,
    );
  });
});

describe("mobile app lock authentication", () => {
  it("unlocks on a successful biometric prompt", async () => {
    assert.equal(
      await runMobileAppLockAuthentication(
        createAuthenticator({ authenticateResult: true }),
        PROMPT_OPTIONS,
      ),
      true,
    );
  });

  it("stays locked when the biometric prompt is not successful", async () => {
    assert.equal(
      await runMobileAppLockAuthentication(
        createAuthenticator({ authenticateResult: false }),
        PROMPT_OPTIONS,
      ),
      false,
    );
  });

  it("stays locked without leaking native detail when the prompt throws", async () => {
    assert.equal(
      await runMobileAppLockAuthentication(
        createAuthenticator({ authenticateError: new Error("sensitive native detail") }),
        PROMPT_OPTIONS,
      ),
      false,
    );
  });
});

describe("mobile app lock preference store", () => {
  it("defaults to disabled when nothing is stored", async () => {
    const { storage } = createMemoryStorage();
    const store: MobileAppLockPreferenceStore = createMobileAppLockPreferenceStore(storage);

    assert.equal(await store.load(), false);
  });

  it("persists an enabled preference across reads", async () => {
    const { map, storage } = createMemoryStorage();
    const store = createMobileAppLockPreferenceStore(storage);

    await store.save(true);

    assert.equal(map.get(MOBILE_APP_LOCK_PREFERENCE_KEY), "true");
    assert.equal(await store.load(), true);

    const reopenedStore = createMobileAppLockPreferenceStore(storage);
    assert.equal(await reopenedStore.load(), true);
  });

  it("persists a disabled preference and reads it back as disabled", async () => {
    const { storage } = createMemoryStorage();
    const store = createMobileAppLockPreferenceStore(storage);

    await store.save(true);
    await store.save(false);

    assert.equal(await store.load(), false);
  });

  it("treats unreadable stored values as disabled", async () => {
    const { storage } = createMemoryStorage({
      [MOBILE_APP_LOCK_PREFERENCE_KEY]: "not-a-boolean",
    });
    const store = createMobileAppLockPreferenceStore(storage);

    assert.equal(await store.load(), false);
  });
});

describe("mobile app lock presentation boundary", () => {
  it("removes protected navigation content while the lock screen is active", () => {
    const productSource = readFileSync(
      join(process.cwd(), "src", "app", "mobile-product-app.tsx"),
      "utf8",
    );
    const boundarySource = readFileSync(
      join(process.cwd(), "src", "app", "components", "mobile-product-app-lock-boundary.tsx"),
      "utf8",
    );

    assert.match(
      productSource,
      /<MobileProductAppLockBoundary[\s\S]*locked=\{appLockLocked\}[\s\S]*<Navigator/,
    );
    assert.match(boundarySource, /locked\s*\?\s*\([\s\S]*<MobileAppLockScreen/);
  });

  it("marks the lock screen as an accessibility modal", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "components", "mobile-app-lock-screen.tsx"),
      "utf8",
    );

    assert.match(source, /accessibilityViewIsModal/);
    assert.match(source, /importantForAccessibility="yes"/);
  });
});
