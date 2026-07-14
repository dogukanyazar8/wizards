import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { BottomTabBarHeightCallbackContext } from "@react-navigation/bottom-tabs";
import { FloatingNavigationChrome } from "../src/navigation/floating-navigation-chrome";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

jest.mock("../src/navigation/mobile-bottom-tab-bar", () => ({
  MobileBottomTabBar: () => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, { testID: "mobile-floating-navigation-pill" });
  },
}));

const tabBarProps = {
  descriptors: {} as never,
  insets: { bottom: 24, left: 0, right: 0, top: 0 },
  navigation: {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  } as never,
  state: {
    index: 0,
    routes: [
      { key: "overview-key", name: "overview" },
      { key: "messages-key", name: "messages" },
      { key: "notifications-key", name: "notifications" },
      { key: "settings-key", name: "settings" },
    ],
  } as never,
};

async function renderChrome(status: "connected" | "idle") {
  const onHeightChange = jest.fn();
  const onOpenVoiceRoom = jest.fn();
  const view = await render(
    <BottomTabBarHeightCallbackContext.Provider value={onHeightChange}>
      <FloatingNavigationChrome
        {...tabBarProps}
        directMessageUnreadCount={0}
        onOpenVoiceRoom={onOpenVoiceRoom}
        voiceRoom={{ channelName: "Daily", status }}
      />
    </BottomTabBarHeightCallbackContext.Provider>,
  );

  return { onHeightChange, onOpenVoiceRoom, view };
}

describe("FloatingNavigationChrome", () => {
  it("reports the measured tab-only height to React Navigation", async () => {
    const view = await renderChrome("idle");

    await fireEvent(view.view.getByTestId("mobile-floating-navigation-chrome"), "layout", {
      nativeEvent: { layout: { height: 94, width: 320, x: 0, y: 0 } },
    });

    expect(view.onHeightChange).toHaveBeenLastCalledWith(94);
    expect(view.view.queryByTestId("mobile-mini-voice-bar")).toBeNull();
  });

  it("reserves its larger measured height while the mini voice bar is active", async () => {
    const view = await renderChrome("connected");

    expect(view.view.getByTestId("mobile-mini-voice-bar")).toBeTruthy();
    await fireEvent(view.view.getByTestId("mobile-floating-navigation-chrome"), "layout", {
      nativeEvent: { layout: { height: 154, width: 320, x: 0, y: 0 } },
    });
    await fireEvent.press(view.view.getByTestId("mobile-mini-voice-bar"));

    expect(view.onHeightChange).toHaveBeenLastCalledWith(154);
    expect(view.onOpenVoiceRoom).toHaveBeenCalledTimes(1);
  });
});
