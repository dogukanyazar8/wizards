import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { BottomTabBarHeightCallbackContext } from "@react-navigation/bottom-tabs";
import { FloatingNavigationChrome } from "../src/navigation/floating-navigation-chrome";
import type { MobileVoiceRoomConnectionStatus } from "../src/voice/mobile-voice-room-contract";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

const mockSelection = jest.fn();

jest.mock("../src/app/providers/mobile-haptics-provider", () => ({
  useMobileHaptics: () => ({ selection: mockSelection }),
}));

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

async function renderChrome({
  status,
  voiceInputMode = "voice-activity",
}: {
  readonly status: MobileVoiceRoomConnectionStatus;
  readonly voiceInputMode?: "push-to-talk" | "voice-activity";
}) {
  const onBeginPushToTalk = jest.fn();
  const onEndPushToTalk = jest.fn();
  const onLeaveVoiceChannel = jest.fn();
  const onHeightChange = jest.fn();
  const onOpenVoiceRoom = jest.fn();
  const onToggleVoiceMute = jest.fn();
  const view = await render(
    <BottomTabBarHeightCallbackContext.Provider value={onHeightChange}>
      <FloatingNavigationChrome
        {...tabBarProps}
        directMessageUnreadCount={0}
        onBeginPushToTalk={onBeginPushToTalk}
        onEndPushToTalk={onEndPushToTalk}
        onLeaveVoiceChannel={onLeaveVoiceChannel}
        onOpenVoiceRoom={onOpenVoiceRoom}
        onToggleVoiceMute={onToggleVoiceMute}
        voiceInputMode={voiceInputMode}
        voiceRoom={{ channelName: "Daily", selfMuted: false, status }}
        voiceServerName="UAT ENV"
      />
    </BottomTabBarHeightCallbackContext.Provider>,
  );

  return {
    onBeginPushToTalk,
    onEndPushToTalk,
    onHeightChange,
    onLeaveVoiceChannel,
    onOpenVoiceRoom,
    onToggleVoiceMute,
    view,
  };
}

describe("FloatingNavigationChrome", () => {
  it("reports the measured tab-only height to React Navigation", async () => {
    const view = await renderChrome({ status: "idle" });

    await fireEvent(view.view.getByTestId("mobile-floating-navigation-chrome"), "layout", {
      nativeEvent: { layout: { height: 94, width: 320, x: 0, y: 0 } },
    });

    expect(view.onHeightChange).toHaveBeenLastCalledWith(94);
    expect(view.view.queryByTestId("mobile-mini-voice-bar")).toBeNull();
  });

  it("reserves its larger measured height while the mini voice bar is active", async () => {
    const view = await renderChrome({ status: "connected" });

    expect(view.view.getByTestId("mobile-mini-voice-bar")).toBeTruthy();
    expect(view.view.getByText("Sese bağlısın · UAT ENV")).toBeTruthy();
    await fireEvent(view.view.getByTestId("mobile-floating-navigation-chrome"), "layout", {
      nativeEvent: { layout: { height: 154, width: 320, x: 0, y: 0 } },
    });
    await fireEvent.press(view.view.getByTestId("mobile-mini-voice-bar"));

    expect(view.onHeightChange).toHaveBeenLastCalledWith(154);
    expect(view.onOpenVoiceRoom).toHaveBeenCalledTimes(1);
  });

  it("renders only for active voice session states", async () => {
    for (const status of ["connecting", "connected", "reconnecting"] as const) {
      const view = await renderChrome({ status });
      expect(view.view.getByTestId("mobile-mini-voice-bar")).toBeTruthy();
    }

    for (const status of ["permission-denied", "error", "leaving", "idle"] as const) {
      const view = await renderChrome({ status });
      expect(view.view.queryByTestId("mobile-mini-voice-bar")).toBeNull();
    }
  });

  it("delegates the mini microphone to voice-activity mute only after connection", async () => {
    mockSelection.mockClear();
    const view = await renderChrome({ status: "connected" });

    await fireEvent.press(view.view.getByTestId("mobile-mini-voice-mic"));

    expect(view.onToggleVoiceMute).toHaveBeenCalledTimes(1);
    expect(view.onBeginPushToTalk).not.toHaveBeenCalled();
    expect(view.onOpenVoiceRoom).not.toHaveBeenCalled();
    expect(mockSelection).toHaveBeenCalledTimes(1);
  });

  it("delegates the mini microphone to push-to-talk press lifecycle", async () => {
    mockSelection.mockClear();
    const view = await renderChrome({ status: "connected", voiceInputMode: "push-to-talk" });
    const microphone = view.view.getByTestId("mobile-mini-voice-mic");

    await fireEvent(microphone, "pressIn");
    await fireEvent(microphone, "pressOut");

    expect(view.onBeginPushToTalk).toHaveBeenCalledTimes(1);
    expect(view.onEndPushToTalk).toHaveBeenCalledTimes(1);
    expect(view.onToggleVoiceMute).not.toHaveBeenCalled();
    expect(view.onOpenVoiceRoom).not.toHaveBeenCalled();
    expect(mockSelection).toHaveBeenCalledTimes(1);
  });

  it("leaves the LiveKit session from the mini bar and only then gives haptic feedback", async () => {
    mockSelection.mockClear();
    const view = await renderChrome({ status: "connected" });

    await fireEvent.press(view.view.getByTestId("mobile-mini-voice-leave"));

    expect(view.onLeaveVoiceChannel).toHaveBeenCalledTimes(1);
    expect(view.onOpenVoiceRoom).not.toHaveBeenCalled();
    expect(mockSelection).toHaveBeenCalledTimes(1);
  });
});
