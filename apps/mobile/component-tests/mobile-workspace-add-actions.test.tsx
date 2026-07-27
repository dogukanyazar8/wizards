import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: (props: Record<string, unknown>) => {
    const ReactModule = require("react");
    const { View } = require("react-native");
    return ReactModule.createElement(View, props);
  },
}));

import {
  MobileServerRailAddButton,
  MobileWorkspaceCreateFab,
} from "../src/app/screens/workspace-add-action-buttons";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const TEST_ID = "mobile-server-add-open";

describe("1a rail add-server action", () => {
  it("keeps the Maestro test id and opens the create/join flow on press", async () => {
    const onPress = jest.fn();
    const view = await render(
      <MobileServerRailAddButton
        accessibilityLabel="Sunucu ekle"
        onPress={onPress}
        testID={TEST_ID}
      />,
    );

    const button = view.getByTestId(TEST_ID);
    await fireEvent(button, "pressIn");
    await fireEvent(button, "pressOut");
    await fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("layers a brand gradient fill under the icon so the press has a filled state", async () => {
    const view = await render(
      <MobileServerRailAddButton
        accessibilityLabel="Sunucu ekle"
        onPress={jest.fn()}
        testID={TEST_ID}
      />,
    );

    const fill = view.getByTestId(`${TEST_ID}-fill`);
    const colors = (fill.props as { colors?: readonly string[] }).colors;

    expect(colors).toHaveLength(2);
  });

  it("stays calm while the member already has servers", async () => {
    const view = await render(
      <MobileServerRailAddButton
        accessibilityLabel="Sunucu ekle"
        onPress={jest.fn()}
        testID={TEST_ID}
      />,
    );

    expect(view.queryByTestId(`${TEST_ID}-pulse`)).toBeNull();
  });

  it("pulses when the rail is empty, because the (+) is the only way forward", async () => {
    const view = await render(
      <MobileServerRailAddButton
        accessibilityLabel="Sunucu ekle"
        highlighted
        onPress={jest.fn()}
        testID={TEST_ID}
      />,
    );

    expect(view.getByTestId(`${TEST_ID}-pulse`)).toBeTruthy();
  });
});

describe("1b compact create fab", () => {
  const FAB_TEST_ID = "mobile-workspace-create-fab";

  it("keeps the Maestro test id and opens the create menu on press", async () => {
    const onPress = jest.fn();
    const view = await render(
      <MobileWorkspaceCreateFab
        accessibilityLabel="Oluştur"
        onPress={onPress}
        testID={FAB_TEST_ID}
      />,
    );

    const fab = view.getByTestId(FAB_TEST_ID);
    await fireEvent(fab, "pressIn");
    await fireEvent(fab, "pressOut");
    await fireEvent.press(fab);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("carries the same brand gradient fill as the rail (+)", async () => {
    const view = await render(
      <MobileWorkspaceCreateFab
        accessibilityLabel="Oluştur"
        onPress={jest.fn()}
        testID={FAB_TEST_ID}
      />,
    );

    const colors = (
      view.getByTestId(`${FAB_TEST_ID}-fill`).props as {
        colors?: readonly string[];
      }
    ).colors;

    expect(colors).toHaveLength(2);
  });
});
