import React, { type ComponentProps } from "react";
import { Text, View } from "react-native";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { MobileDeviceIntegrityWarning } from "../src/app/components/mobile-device-integrity-warning";
import { MobileAuthProvider, useMobileAuth } from "../src/auth/mobile-auth-context";
import type { MobileSessionRepository } from "../src/auth/session-store";
import { activeMobileCopy } from "../src/locale/mobile-locale-preferences";
import {
  MOBILE_DEVICE_INTEGRITY_CHECK_FAILED_EVENT,
  MOBILE_DEVICE_INTEGRITY_COMPROMISED_EVENT,
  type MobileDeviceIntegrityDetector,
  type MobileSecuritySignalLogger,
} from "../src/security/mobile-device-integrity";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const copy = activeMobileCopy;

type MobileAuthProviderProps = ComponentProps<typeof MobileAuthProvider>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createRepository(): MobileSessionRepository {
  return {
    clear: jest.fn(async () => undefined),
    load: jest.fn(async () => null),
    save: jest.fn(async () => undefined),
  };
}

function createDetector(input: {
  isPhysicalDevice: boolean;
  rootedResult?: boolean;
  rootedPromise?: Promise<boolean>;
  rootedError?: Error;
}): MobileDeviceIntegrityDetector {
  return {
    isPhysicalDevice: jest.fn(() => input.isPhysicalDevice),
    isRootedOrJailbroken: jest.fn(async () => {
      if (input.rootedError) {
        throw input.rootedError;
      }

      return input.rootedPromise ?? input.rootedResult ?? false;
    }),
  };
}

function createProviderProps(
  overrides: Partial<MobileAuthProviderProps> = {},
): Omit<MobileAuthProviderProps, "children"> {
  return {
    deviceIntegrityDetector: createDetector({
      isPhysicalDevice: true,
      rootedResult: false,
    }),
    repository: createRepository(),
    runtimeConfig: {
      apiUrl: "https://mobile-component.test",
      environment: "development",
      releaseChannel: "development",
      socketUrl: "https://mobile-component.test",
      webUrl: "https://mobile-component.test",
    },
    securitySignalLogger: {
      log: jest.fn(),
    },
    ...overrides,
  };
}

function DeviceIntegrityHarness() {
  const {
    deviceIntegrityStatus,
    deviceIntegrityWarningVisible,
    dismissDeviceIntegrityWarning,
    status,
  } = useMobileAuth();

  return (
    <View>
      <Text testID="mobile-test-auth-status">{status}</Text>
      <Text testID="mobile-test-integrity-status">{deviceIntegrityStatus}</Text>
      <Text>auth-flow-visible</Text>
      <MobileDeviceIntegrityWarning
        onDismiss={dismissDeviceIntegrityWarning}
        visible={deviceIntegrityWarningVisible}
      />
    </View>
  );
}

async function renderIntegrityHarness(overrides: Partial<MobileAuthProviderProps> = {}) {
  const props = createProviderProps(overrides);
  const view = await render(
    <MobileAuthProvider {...props}>
      <DeviceIntegrityHarness />
    </MobileAuthProvider>,
  );

  return { props, view };
}

describe("mobile device integrity warning", () => {
  it("warns without blocking rooted or jailbroken physical devices and can be dismissed", async () => {
    const deviceIntegrityDetector = createDetector({
      isPhysicalDevice: true,
      rootedResult: true,
    });
    const securitySignalLogger: MobileSecuritySignalLogger = {
      log: jest.fn(),
    };
    const { view } = await renderIntegrityHarness({
      deviceIntegrityDetector,
      securitySignalLogger,
    });

    await waitFor(() => {
      expect(view.getByTestId("mobile-device-integrity-warning")).toBeTruthy();
      expect(view.getByTestId("mobile-test-auth-status").props.children).toBe("signed-out");
    });
    expect(view.getByText("auth-flow-visible")).toBeTruthy();
    expect(securitySignalLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        advisory: true,
        event: MOBILE_DEVICE_INTEGRITY_COMPROMISED_EVENT,
      }),
    );

    await fireEvent.press(view.getByLabelText(copy.deviceIntegrityDismissAction));

    expect(view.queryByTestId("mobile-device-integrity-warning")).toBeNull();
    expect(view.getByText("auth-flow-visible")).toBeTruthy();
  });

  it("keeps clean physical devices warning-free", async () => {
    const securitySignalLogger: MobileSecuritySignalLogger = {
      log: jest.fn(),
    };
    const { view } = await renderIntegrityHarness({ securitySignalLogger });

    await waitFor(() =>
      expect(view.getByTestId("mobile-test-integrity-status").props.children).toBe("clean"),
    );
    expect(view.queryByTestId("mobile-device-integrity-warning")).toBeNull();
    expect(securitySignalLogger.log).not.toHaveBeenCalled();
  });

  it("skips the native root check and warning on emulators and simulators", async () => {
    const deviceIntegrityDetector = createDetector({
      isPhysicalDevice: false,
      rootedResult: true,
    });
    const securitySignalLogger: MobileSecuritySignalLogger = {
      log: jest.fn(),
    };
    const { view } = await renderIntegrityHarness({
      deviceIntegrityDetector,
      securitySignalLogger,
    });

    await waitFor(() =>
      expect(view.getByTestId("mobile-test-integrity-status").props.children).toBe("emulator"),
    );
    expect(deviceIntegrityDetector.isRootedOrJailbroken).not.toHaveBeenCalled();
    expect(view.queryByTestId("mobile-device-integrity-warning")).toBeNull();
    expect(securitySignalLogger.log).not.toHaveBeenCalled();
  });

  it("completes auth bootstrap before a pending integrity check resolves", async () => {
    const rooted = createDeferred<boolean>();
    const deviceIntegrityDetector = createDetector({
      isPhysicalDevice: true,
      rootedPromise: rooted.promise,
    });
    const { view } = await renderIntegrityHarness({ deviceIntegrityDetector });

    await waitFor(() =>
      expect(view.getByTestId("mobile-test-auth-status").props.children).toBe("signed-out"),
    );
    expect(view.getByTestId("mobile-test-integrity-status").props.children).toBe("checking");
    expect(view.queryByTestId("mobile-device-integrity-warning")).toBeNull();

    rooted.resolve(true);

    await waitFor(() => expect(view.getByTestId("mobile-device-integrity-warning")).toBeTruthy());
  });

  it("fails open and emits only a bounded signal when detection fails", async () => {
    const securitySignalLogger: MobileSecuritySignalLogger = {
      log: jest.fn(),
    };
    const { view } = await renderIntegrityHarness({
      deviceIntegrityDetector: createDetector({
        isPhysicalDevice: true,
        rootedError: new Error("sensitive native detail"),
      }),
      securitySignalLogger,
    });

    await waitFor(() =>
      expect(view.getByTestId("mobile-test-integrity-status").props.children).toBe("unavailable"),
    );
    expect(view.getByTestId("mobile-test-auth-status").props.children).toBe("signed-out");
    expect(view.queryByTestId("mobile-device-integrity-warning")).toBeNull();
    expect(securitySignalLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        advisory: true,
        event: MOBILE_DEVICE_INTEGRITY_CHECK_FAILED_EVENT,
      }),
    );
    expect(JSON.stringify((securitySignalLogger.log as jest.Mock).mock.calls)).not.toContain(
      "sensitive native detail",
    );
  });
});
