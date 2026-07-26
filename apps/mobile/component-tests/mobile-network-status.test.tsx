import React from "react";
import { Text } from "react-native";
import { act, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { lightTheme, type MobileTheme } from "../src/design/themes";

const mockTheme: MobileTheme = lightTheme;

type NetInfoListener = (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) => void;

let netInfoListener: NetInfoListener | null = null;

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: (listener: NetInfoListener) => {
      netInfoListener = listener;
      return () => {
        netInfoListener = null;
      };
    },
    refresh: () => Promise.resolve({ isConnected: true, isInternetReachable: true }),
  },
}));

jest.mock("../src/app/providers/mobile-theme-provider", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (factory: (theme: MobileTheme) => Record<string, object>) => {
    const { StyleSheet } = require("react-native");
    return StyleSheet.create(factory(mockTheme));
  },
}));

jest.mock("../src/app/components/kit/toast", () => ({
  useToast: () => ({ dismissToast: jest.fn(), showToast: jest.fn() }),
}));

import {
  MobileNetworkProvider,
  useMobileNetworkStatus,
} from "../src/app/providers/mobile-network-provider";

function NetworkStatusProbe() {
  return <Text testID="network-status-probe">{useMobileNetworkStatus()}</Text>;
}

describe("mobile network status", () => {
  beforeEach(() => {
    netInfoListener = null;
  });

  it("publishes the status to the tree so the connectivity banner can read it", async () => {
    const view = await render(
      <MobileNetworkProvider>
        <NetworkStatusProbe />
      </MobileNetworkProvider>,
    );

    expect(view.getByTestId("network-status-probe").props.children).toBe("unknown");

    await act(async () => {
      netInfoListener?.({ isConnected: false, isInternetReachable: false });
    });

    expect(view.getByTestId("network-status-probe").props.children).toBe("offline");
    // The provider itself no longer renders a bar; MobileConnectivityBanner owns
    // that decision so network and socket state cannot both claim the top strip.
    expect(view.queryByTestId("mobile-offline-banner")).toBeNull();

    await act(async () => {
      netInfoListener?.({ isConnected: true, isInternetReachable: true });
    });

    expect(view.getByTestId("network-status-probe").props.children).toBe("online");
  });

  it("reads as unknown outside the provider instead of throwing", async () => {
    const view = await render(<NetworkStatusProbe />);

    expect(view.getByTestId("network-status-probe").props.children).toBe("unknown");
  });
});
