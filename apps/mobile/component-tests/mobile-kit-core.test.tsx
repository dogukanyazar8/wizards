import React from "react";
import { StyleSheet, Text } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";

let mockTheme: MobileTheme = lightTheme;

jest.mock("../src/app/providers/mobile-theme-provider", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (factory: (theme: MobileTheme) => Record<string, object>) => {
    const { StyleSheet } = require("react-native");
    return StyleSheet.create(factory(mockTheme));
  },
}));

import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
} from "../src/app/components/kit";

function CoreKitProbe() {
  return (
    <>
      <Icon accessibilityLabel="Search" name="search" testID="kit-icon" />
      <Button label="Continue" onPress={jest.fn()} testID="kit-button" />
      <Button busy label="Saving" onPress={jest.fn()} testID="kit-button-busy" />
      <Button disabled label="Disabled" onPress={jest.fn()} testID="kit-button-disabled" />
      <IconButton
        accessibilityLabel="Close"
        icon="close"
        onPress={jest.fn()}
        testID="kit-icon-button"
      />
      <Card testID="kit-card">
        <Text>Card content</Text>
      </Card>
      <ListRow
        onPress={jest.fn()}
        subtitle="Recent activity"
        testID="kit-list-row"
        title="Messages"
      />
      <Badge label="Ready" testID="kit-badge" tone="success" />
      <Avatar imageUrl={null} label="Dogukan Yazar" testID="kit-avatar" />
      <Divider testID="kit-divider" />
      <EmptyState
        description="Start a conversation from your workspace."
        icon="chatbubble-ellipses-outline"
        testID="kit-empty-state"
        title="No messages yet"
      />
    </>
  );
}

for (const theme of [lightTheme, darkTheme]) {
  describe(`${theme.id} core mobile kit`, () => {
    it("renders accessible actions and semantic structural primitives", async () => {
      mockTheme = theme;
      const view = await render(<CoreKitProbe />);

      expect(view.getByTestId("kit-icon").props.accessibilityLabel).toBe("Search");
      expect(view.getByTestId("kit-button").props.accessibilityRole).toBe("button");
      expect(view.getByTestId("kit-button-busy").props.accessibilityState.busy).toBe(true);
      expect(view.getByTestId("kit-button-busy").props.accessibilityState.disabled).toBe(true);
      expect(view.getByTestId("kit-button-disabled").props.accessibilityState.disabled).toBe(true);

      const iconButton = view.getByTestId("kit-icon-button");
      const iconButtonStyle = StyleSheet.flatten(iconButton.props.style);
      expect(iconButton.props.accessibilityLabel).toBe("Close");
      expect(iconButton.props.accessibilityRole).toBe("button");
      expect(iconButtonStyle.minHeight).toBeGreaterThanOrEqual(44);
      expect(iconButtonStyle.minWidth).toBeGreaterThanOrEqual(44);

      expect(view.getByTestId("kit-list-row").props.accessibilityRole).toBe("button");
      expect(view.getByText("Ready")).toBeTruthy();
      expect(view.getByTestId("kit-avatar").props.accessibilityRole).toBe("image");
      expect(view.getByText("DO")).toBeTruthy();
      expect(view.getByTestId("kit-divider").props.role).toBe("separator");
      expect(view.getByText("No messages yet").props.accessibilityRole).toBe("header");
      expect(view.getByText("Start a conversation from your workspace.")).toBeTruthy();

      const cardStyle = StyleSheet.flatten(view.getByTestId("kit-card").props.style);
      expect(cardStyle.backgroundColor).toBe(theme.surface.card);
    });

    it("dispatches interactive rows without widening their state", async () => {
      mockTheme = theme;
      const onPress = jest.fn();
      const view = await render(<ListRow onPress={onPress} testID="interactive-row" title="Open" />);

      await fireEvent.press(view.getByTestId("interactive-row"));

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });
}
