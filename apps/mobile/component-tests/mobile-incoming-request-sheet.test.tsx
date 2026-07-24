import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

// The shared BottomSheet drives its own reanimated/gesture stack; the sheet's
// content and wiring are what this suite exercises, so it is flattened to an
// open/null wrapper the same way the other sheet suites do.
jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { Pressable, View } = require("react-native");

  return {
    BottomSheet: ({
      children,
      onClose,
      open,
      testID,
    }: {
      children: React.ReactNode;
      onClose(): void;
      open: boolean;
      testID: string;
    }) =>
      open
        ? ReactRuntime.createElement(
            View,
            { onAccessibilityEscape: onClose, testID: `${testID}-panel` },
            ReactRuntime.createElement(Pressable, {
              onPress: onClose,
              testID: `${testID}-backdrop`,
            }),
            children,
          )
        : null,
  };
});

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { MobileIncomingRequestSheet } from "../src/app/overlays/mobile-incoming-request-sheet";
import type { MobileVoiceInviteOverlayEntry } from "../src/app/overlays/mobile-incoming-request-model";
import { createMobileIncomingCall } from "../src/voice/mobile-dm-call-state";

const incomingCall = createMobileIncomingCall({
  conversationId: "dm-1",
  expiresAt: new Date(Date.now() + 45_000).toISOString(),
  fromUser: { avatarUrl: null, displayName: "Ada Lovelace", id: "user-ada", username: "ada" },
  video: false,
});

const voiceInvite: MobileVoiceInviteOverlayEntry = {
  channelId: "chan-1",
  channelName: "Genel Ses",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  fromUser: { avatarUrl: null, displayName: "Deniz", id: "user-deniz", username: "deniz" },
  id: "invite-1",
  serverId: "srv-1",
  serverName: "Wizards",
};

const noop = () => undefined;

function createHandlers() {
  return {
    onAcceptCall: jest.fn(),
    onAcceptInvite: jest.fn(),
    onDeclineCall: jest.fn(),
    onDeclineInvite: jest.fn(),
  };
}

describe("mobile incoming request sheet", () => {
  it("stays hidden with no call and no invites", async () => {
    const view = await render(
      <MobileIncomingRequestSheet
        call={null}
        invites={[]}
        onAcceptCall={noop}
        onAcceptInvite={noop}
        onDeclineCall={noop}
        onDeclineInvite={noop}
      />,
    );

    expect(view.queryByTestId("mobile-incoming-request-card")).toBeNull();
  });

  it("rings an inbound voice call with phone-tone accept and decline", async () => {
    const handlers = createHandlers();
    const view = await render(
      <MobileIncomingRequestSheet call={incomingCall} invites={[]} {...handlers} />,
    );

    expect(view.getByText("Gelen sesli arama")).toBeTruthy();
    expect(view.getByText("Ada Lovelace seni arıyor.")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-incoming-request-accept"));
    expect(handlers.onAcceptCall).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByTestId("mobile-incoming-request-decline"));
    expect(handlers.onDeclineCall).toHaveBeenCalledTimes(1);
  });

  it("labels a video call separately", async () => {
    const view = await render(
      <MobileIncomingRequestSheet
        call={{ ...incomingCall, isVideo: true }}
        invites={[]}
        onAcceptCall={noop}
        onAcceptInvite={noop}
        onDeclineCall={noop}
        onDeclineInvite={noop}
      />,
    );

    expect(view.getByText("Gelen görüntülü arama")).toBeTruthy();
  });

  it("shows a voice-room invite and reports its id on both actions", async () => {
    const handlers = createHandlers();
    const view = await render(
      <MobileIncomingRequestSheet call={null} invites={[voiceInvite]} {...handlers} />,
    );

    expect(view.getByText("Ses daveti")).toBeTruthy();
    expect(view.getByText("Deniz, Wizards / Genel Ses odasına davet ediyor.")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-incoming-request-accept"));
    expect(handlers.onAcceptInvite).toHaveBeenCalledWith("invite-1");
    await fireEvent.press(view.getByTestId("mobile-incoming-request-decline"));
    expect(handlers.onDeclineInvite).toHaveBeenCalledWith("invite-1");
  });

  it("lets an inbound call outrank a queued invite", async () => {
    const handlers = createHandlers();
    const view = await render(
      <MobileIncomingRequestSheet call={incomingCall} invites={[voiceInvite]} {...handlers} />,
    );

    expect(view.getByText("Gelen sesli arama")).toBeTruthy();
    expect(view.queryByText("Ses daveti")).toBeNull();

    await fireEvent.press(view.getByTestId("mobile-incoming-request-accept"));
    expect(handlers.onAcceptCall).toHaveBeenCalledTimes(1);
    expect(handlers.onAcceptInvite).not.toHaveBeenCalled();
  });
});
