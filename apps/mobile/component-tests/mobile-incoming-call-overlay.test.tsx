import React from "react";
import { fireEvent } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { renderWithMobileTheme as render } from "./render-with-mobile-theme";
import { MobileIncomingCallOverlay } from "../src/app/overlays/mobile-incoming-call-overlay";
import { createMobileIncomingCall } from "../src/voice/mobile-dm-call-state";

const incomingCall = createMobileIncomingCall({
  conversationId: "dm-1",
  expiresAt: new Date(Date.now() + 45_000).toISOString(),
  fromUser: { avatarUrl: null, displayName: "Ada Lovelace", id: "user-ada", username: "ada" },
  video: false,
});

describe("mobile incoming DM call overlay", () => {
  it("stays hidden when nothing is ringing", async () => {
    const view = await render(
      <MobileIncomingCallOverlay call={null} onAccept={jest.fn()} onDecline={jest.fn()} />,
    );

    expect(view.queryByTestId("mobile-incoming-call-overlay")).toBeNull();
  });

  it("names the caller and reports accept and decline", async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const view = await render(
      <MobileIncomingCallOverlay call={incomingCall} onAccept={onAccept} onDecline={onDecline} />,
    );

    expect(view.getByTestId("mobile-incoming-call-overlay")).toBeTruthy();
    expect(view.getByText("Gelen sesli arama")).toBeTruthy();
    expect(view.getByText("Ada Lovelace seni arıyor.")).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-incoming-call-accept"));
    await fireEvent.press(view.getByTestId("mobile-incoming-call-decline"));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("labels a video call separately", async () => {
    const view = await render(
      <MobileIncomingCallOverlay
        call={{ ...incomingCall, isVideo: true }}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
      />,
    );

    expect(view.getByText("Gelen görüntülü arama")).toBeTruthy();
  });
});
