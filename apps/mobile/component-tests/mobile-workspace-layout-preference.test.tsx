import React from "react";
import { Pressable, Text } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MOBILE_WORKSPACE_LAYOUT_PREFERENCE_KEY,
  MobileWorkspaceLayoutProvider,
  useMobileWorkspaceLayoutPreference,
} from "../src/app/providers/mobile-workspace-layout-provider";

const getItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const setItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

function PreferenceProbe() {
  const { layout, setLayout } = useMobileWorkspaceLayoutPreference();
  return (
    <>
      <Text testID="workspace-layout-value">{layout}</Text>
      <Pressable onPress={() => setLayout("compact")} testID="workspace-layout-compact">
        <Text>Compact</Text>
      </Pressable>
    </>
  );
}

describe("mobile workspace layout preference", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
  });

  it("defaults to the canonical rail and persists an explicit compact selection", async () => {
    const view = await render(
      <MobileWorkspaceLayoutProvider>
        <PreferenceProbe />
      </MobileWorkspaceLayoutProvider>,
    );

    expect(view.getByTestId("workspace-layout-value").props.children).toBe("rail");

    await fireEvent.press(view.getByTestId("workspace-layout-compact"));
    expect(view.getByTestId("workspace-layout-value").props.children).toBe("compact");
    await waitFor(() =>
      expect(setItem).toHaveBeenCalledWith(MOBILE_WORKSPACE_LAYOUT_PREFERENCE_KEY, "compact"),
    );
  });
});
