import React, { type ComponentProps } from "react";
import { AppState, Text, View } from "react-native";
import { act, fireEvent, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { MobileProductAppLockBoundary } from "../src/app/components/mobile-product-app-lock-boundary";
import { MobileAuthProvider, useMobileAuth } from "../src/auth/mobile-auth-context";
import type { MobileAppLockPreferenceStore } from "../src/auth/mobile-app-lock-preference-store";
import type { MobileSessionRepository } from "../src/auth/session-store";
import type { MobileSessionSnapshot } from "../src/auth/session-types";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";
import type { MobileDeviceIntegrityDetector } from "../src/security/mobile-device-integrity";
import type { MobileBiometricAuthenticator } from "../src/security/mobile-app-lock";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const copy = activeMobileCopy;

type MobileAuthProviderProps = ComponentProps<typeof MobileAuthProvider>;

let appStateHandlers: Array<(state: string) => void> = [];

beforeEach(() => {
  appStateHandlers = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, handler) => {
    appStateHandlers.push(handler as (state: string) => void);
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function emitAppState(state: string) {
  await act(async () => {
    for (const handler of appStateHandlers) {
      handler(state);
    }
    await Promise.resolve();
  });
}

function createSignedInSession(): MobileSessionSnapshot {
  const now = Date.now();
  return {
    lastValidatedAt: now,
    schemaVersion: 1,
    tokens: {
      accessToken: "mobile-access-token-0123456789abcdef",
      expiresAt: now + 60 * 60 * 1000,
      issuedAt: now,
      refreshToken: null,
      scopes: ["mobile"],
      tokenType: "Bearer",
    },
    user: {
      avatarUrl: null,
      displayName: "Ada Test",
      id: "user-1",
      username: "ada_test",
    },
  };
}

function createSignedInRepository(): MobileSessionRepository {
  const session = createSignedInSession();
  return {
    clear: jest.fn(async () => undefined),
    load: jest.fn(async () => session),
    save: jest.fn(async () => undefined),
  };
}

function createDetector(): MobileDeviceIntegrityDetector {
  return {
    isPhysicalDevice: jest.fn(() => true),
    isRootedOrJailbroken: jest.fn(async () => false),
  };
}

function createAuthenticator(input: {
  authenticatePromise?: Promise<{ success: boolean }>;
  authenticateResult?: boolean;
  authenticateResults?: boolean[];
  hasHardware?: boolean;
  hasHardwarePromise?: Promise<boolean>;
  isEnrolled?: boolean;
}): MobileBiometricAuthenticator {
  const queue = input.authenticateResults ? [...input.authenticateResults] : null;
  return {
    authenticate: jest.fn(async () => {
      if (input.authenticatePromise) {
        return input.authenticatePromise;
      }

      const next = queue && queue.length > 0 ? queue.shift()! : (input.authenticateResult ?? false);
      return { success: next };
    }),
    hasHardware: jest.fn(async () =>
      input.hasHardwarePromise ? input.hasHardwarePromise : (input.hasHardware ?? true),
    ),
    isEnrolled: jest.fn(async () => input.isEnrolled ?? true),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createPreferenceStore(enabled: boolean): MobileAppLockPreferenceStore {
  let value = enabled;
  return {
    load: jest.fn(async () => value),
    save: jest.fn(async (next: boolean) => {
      value = next;
    }),
  };
}

function createProviderProps(
  overrides: Partial<MobileAuthProviderProps> = {},
): Omit<MobileAuthProviderProps, "children"> {
  return {
    appLockPreferenceStore: createPreferenceStore(false),
    biometricAuthenticator: createAuthenticator({ hasHardware: true, isEnrolled: true }),
    deviceIntegrityDetector: createDetector(),
    repository: createSignedInRepository(),
    runtimeConfig: {
      apiUrl: "https://mobile-component.test",
      environment: "development",
      releaseChannel: "development",
      socketUrl: "https://mobile-component.test",
      webUrl: "https://mobile-component.test",
    },
    securitySignalLogger: { log: jest.fn() },
    ...overrides,
  };
}

function AppLockHarness() {
  const { appLockLocked, appLockStatus, retryAppLockUnlock, signOut, status } = useMobileAuth();

  return (
    <View>
      <Text testID="mobile-test-auth-status">{status}</Text>
      <Text testID="mobile-test-app-lock-status">{appLockStatus}</Text>
      <MobileProductAppLockBoundary
        locked={appLockLocked}
        onRetry={() => {
          void retryAppLockUnlock();
        }}
        onSignOut={() => {
          void signOut();
        }}
      >
        <Text testID="mobile-test-protected-content">protected DM navigator</Text>
      </MobileProductAppLockBoundary>
    </View>
  );
}

async function renderHarness(overrides: Partial<MobileAuthProviderProps> = {}) {
  const props = createProviderProps(overrides);
  const view = await render(
    <MobileAuthProvider {...props}>
      <AppLockHarness />
    </MobileAuthProvider>,
  );

  await waitFor(() =>
    expect(
      view.getByTestId("mobile-test-auth-status", { includeHiddenElements: true }).props.children,
    ).toBe("signed-in"),
  );

  return { props, view };
}

describe("mobile biometric app lock", () => {
  it("keeps protected content hidden until the lock preference resolves", async () => {
    const preference = createDeferred<boolean>();
    const appLockPreferenceStore: MobileAppLockPreferenceStore = {
      load: jest.fn(() => preference.promise),
      save: jest.fn(async () => undefined),
    };
    const { view } = await renderHarness({ appLockPreferenceStore });

    expect(
      view.getByTestId("mobile-test-app-lock-status", { includeHiddenElements: true }).props
        .children,
    ).toBe("idle");
    expect(view.getByTestId("mobile-app-lock-screen")).toBeTruthy();
    expect(view.queryByTestId("mobile-test-protected-content")).toBeNull();

    preference.resolve(false);
    await waitFor(() => expect(view.getByTestId("mobile-test-protected-content")).toBeTruthy());
  });

  it("keeps protected content hidden while biometric availability is checking", async () => {
    const availability = createDeferred<boolean>();
    const { view } = await renderHarness({
      appLockPreferenceStore: createPreferenceStore(true),
      biometricAuthenticator: createAuthenticator({ hasHardwarePromise: availability.promise }),
    });

    expect(
      view.getByTestId("mobile-test-app-lock-status", { includeHiddenElements: true }).props
        .children,
    ).toBe("checking");
    expect(view.getByTestId("mobile-app-lock-screen")).toBeTruthy();
    expect(view.queryByTestId("mobile-test-protected-content")).toBeNull();

    availability.resolve(false);
    await waitFor(() => expect(view.getByTestId("mobile-test-protected-content")).toBeTruthy());
  });

  it("lets a signed-in user straight in when the lock preference is off", async () => {
    const biometricAuthenticator = createAuthenticator({ hasHardware: true });
    const { view } = await renderHarness({
      appLockPreferenceStore: createPreferenceStore(false),
      biometricAuthenticator,
    });

    expect(view.getByTestId("mobile-test-protected-content")).toBeTruthy();
    expect(view.queryByTestId("mobile-app-lock-screen")).toBeNull();
    expect(view.getByTestId("mobile-test-app-lock-status").props.children).toBe("idle");
    expect(biometricAuthenticator.authenticate).not.toHaveBeenCalled();
  });

  it("locks an enabled capable device and reveals content after a successful unlock", async () => {
    const biometricAuthenticator = createAuthenticator({
      authenticateResult: true,
      hasHardware: true,
      isEnrolled: true,
    });
    const { view } = await renderHarness({
      appLockPreferenceStore: createPreferenceStore(true),
      biometricAuthenticator,
    });

    await waitFor(() => expect(view.getByTestId("mobile-app-lock-screen")).toBeTruthy());
    expect(view.queryByTestId("mobile-test-protected-content")).toBeNull();

    await fireEvent.press(view.getByLabelText(copy.appLockRetryAction));

    await waitFor(() =>
      expect(view.getByTestId("mobile-test-app-lock-status").props.children).toBe("unlocked"),
    );
    expect(biometricAuthenticator.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        disableDeviceFallback: false,
      }),
    );
    const promptOptions = (biometricAuthenticator.authenticate as jest.Mock).mock.calls[0]?.[0];
    expect(promptOptions?.cancelLabel).not.toBe(copy.appLockSignOutAction);
    expect(view.queryByTestId("mobile-app-lock-screen")).toBeNull();
    expect(view.getByTestId("mobile-test-protected-content")).toBeTruthy();
  });

  it("fails open and never locks when biometric hardware or enrollment is missing", async () => {
    const biometricAuthenticator = createAuthenticator({ hasHardware: false });
    const { view } = await renderHarness({
      appLockPreferenceStore: createPreferenceStore(true),
      biometricAuthenticator,
    });

    await waitFor(() =>
      expect(view.getByTestId("mobile-test-app-lock-status").props.children).toBe("unavailable"),
    );
    expect(view.queryByTestId("mobile-app-lock-screen")).toBeNull();
    expect(view.getByTestId("mobile-test-protected-content")).toBeTruthy();
    expect(biometricAuthenticator.authenticate).not.toHaveBeenCalled();
  });

  it("stays locked after a failed prompt and offers a working sign-out escape hatch", async () => {
    const biometricAuthenticator = createAuthenticator({
      authenticateResult: false,
      hasHardware: true,
    });
    const { view } = await renderHarness({
      appLockPreferenceStore: createPreferenceStore(true),
      biometricAuthenticator,
    });

    await waitFor(() => expect(view.getByTestId("mobile-app-lock-screen")).toBeTruthy());

    await fireEvent.press(view.getByLabelText(copy.appLockRetryAction));

    expect(view.getByTestId("mobile-app-lock-screen")).toBeTruthy();
    expect(view.queryByTestId("mobile-test-protected-content")).toBeNull();

    await fireEvent.press(view.getByLabelText(copy.appLockSignOutAction));

    await waitFor(() =>
      expect(view.getByTestId("mobile-test-auth-status").props.children).toBe("signed-out"),
    );
    expect(view.queryByTestId("mobile-app-lock-screen")).toBeNull();
  });

  it("coalesces repeated unlock presses into one native biometric prompt", async () => {
    const authentication = createDeferred<{ success: boolean }>();
    const biometricAuthenticator = createAuthenticator({
      authenticatePromise: authentication.promise,
      hasHardware: true,
      isEnrolled: true,
    });
    const { view } = await renderHarness({
      appLockPreferenceStore: createPreferenceStore(true),
      biometricAuthenticator,
    });

    await waitFor(() => expect(view.getByTestId("mobile-app-lock-screen")).toBeTruthy());

    await fireEvent.press(view.getByLabelText(copy.appLockRetryAction));
    await fireEvent.press(view.getByLabelText(copy.appLockRetryAction));

    expect(biometricAuthenticator.authenticate).toHaveBeenCalledTimes(1);

    authentication.resolve({ success: true });
    await waitFor(() =>
      expect(view.getByTestId("mobile-test-app-lock-status").props.children).toBe("unlocked"),
    );
  });

  it("re-locks when the app returns to the foreground after being unlocked", async () => {
    const biometricAuthenticator = createAuthenticator({
      authenticateResult: true,
      hasHardware: true,
    });
    const { view } = await renderHarness({
      appLockPreferenceStore: createPreferenceStore(true),
      biometricAuthenticator,
    });

    await waitFor(() => expect(view.getByTestId("mobile-app-lock-screen")).toBeTruthy());
    await fireEvent.press(view.getByLabelText(copy.appLockRetryAction));
    await waitFor(() =>
      expect(view.getByTestId("mobile-test-app-lock-status").props.children).toBe("unlocked"),
    );

    await emitAppState("background");
    await emitAppState("active");

    await waitFor(() => expect(view.getByTestId("mobile-app-lock-screen")).toBeTruthy());
    expect(view.queryByTestId("mobile-test-protected-content")).toBeNull();
  });
});
