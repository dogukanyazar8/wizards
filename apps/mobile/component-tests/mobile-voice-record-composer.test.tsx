import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { fireEvent } from "@testing-library/react-native";

const mockVoiceRecorder = {
  discard: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  isRecording: true,
  phase: "recording" as const,
  start: jest.fn<() => Promise<"recording">>().mockResolvedValue("recording"),
  stop: jest.fn<() => Promise<null>>().mockResolvedValue(null),
};

jest.mock("../src/media/mobile-voice-message-recorder", () => ({
  useMobileVoiceMessageRecorder: () => mockVoiceRecorder,
}));

jest.mock("../src/media/mobile-message-attachment-picker", () => ({
  pickMobileMessageAttachmentFromDocument: jest.fn(),
  pickMobileMessageAttachmentFromPhotoLibrary: jest.fn(),
}));

jest.mock("../src/media/mobile-message-attachment-upload", () => ({
  uploadMobileMessageAttachmentToUploadThing: jest.fn(),
}));

import { DMComposer } from "../src/app/composer/mobile-composer";
import { createMobileComposerStyles } from "../src/app/composer/mobile-composer.styles";
import { createDMChatStyles } from "../src/app/components/dm-chat-primitives.styles";
import { mobileMessagingMetrics } from "../src/design/tokens";
import { darkTheme, lightTheme } from "../src/design/themes";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

async function renderRecordingComposer() {
  return render(
    <DMComposer
      getAccessToken={async () => "mobile-access-token"}
      onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
      variant="dm"
    />,
  );
}

describe("MSG-1h recording composer", () => {
  it("splits the recording state into delete, field and send", async () => {
    const view = await renderRecordingComposer();

    // §2 "1h".2: three zones, and the third one is the same button the finger
    // is already holding — swapping it would drop the press.
    expect(view.getByTestId("mobile-dm-voice-record-cancel")).toBeTruthy();
    expect(view.getByTestId("mobile-dm-voice-recording")).toBeTruthy();
    expect(view.getByTestId("mobile-dm-voice-record-button")).toBeTruthy();
    expect(view.queryByTestId("mobile-dm-composer-input")).toBeNull();
    expect(view.queryByTestId("mobile-dm-attach-button")).toBeNull();
  });

  it("prints the duration in tabular figures so the seconds column cannot jitter", async () => {
    const view = await renderRecordingComposer();
    const duration = view.getByTestId("mobile-dm-voice-recording-duration");

    expect(duration.props.children).toBe("0:00");
    expect(StyleSheet.flatten(duration.props.style)).toMatchObject({
      fontSize: 12.5,
      fontVariant: ["tabular-nums"],
    });
  });

  it("draws the live waveform as one recorded path and one upcoming path", async () => {
    const view = await renderRecordingComposer();
    const wave = view.getByTestId("mobile-dm-voice-recording-wave");

    expect(wave.props.width).toBe(112);
    expect(wave.props.height).toBe(20);
  });

  it("discards the take from the delete button", async () => {
    const view = await renderRecordingComposer();

    await fireEvent.press(view.getByTestId("mobile-dm-voice-record-cancel"));
    expect(mockVoiceRecorder.discard).toHaveBeenCalledTimes(1);
  });

  it("labels the primary button as stop while a take is running", async () => {
    const view = await renderRecordingComposer();

    expect(view.getByTestId("mobile-dm-voice-record-button").props.accessibilityLabel).toBe(
      copy.composerVoiceStopAction,
    );
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("dresses the %s recording row from the messaging tokens", (_scheme, theme) => {
    const styles = createMobileComposerStyles(theme);

    expect(styles.dmChatRecordingDelete).toMatchObject({
      backgroundColor: theme.messaging.recordDeleteSurface,
      borderRadius: mobileMessagingMetrics.composer.plusRadius,
      height: mobileMessagingMetrics.composer.plusSize,
    });
    expect(styles.dmChatRecordingField).toMatchObject({
      backgroundColor: theme.messaging.field,
      borderRadius: mobileMessagingMetrics.composer.fieldRadius,
      height: mobileMessagingMetrics.composer.fieldHeight,
    });
    expect(styles.dmChatRecordingDot).toMatchObject({
      backgroundColor: theme.messaging.recordDot,
      height: 9,
      width: 9,
    });
  });
});

describe("MSG-1h dark theme", () => {
  it("changes only colour: the 1d geometry survives the theme swap", () => {
    const light = createDMChatStyles(lightTheme) as Record<string, Record<string, unknown>>;
    const dark = createDMChatStyles(darkTheme) as Record<string, Record<string, unknown>>;
    const geometryKeys = [
      "borderRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius",
      "gap",
      "height",
      "marginLeft",
      "marginTop",
      "maxWidth",
      "paddingBottom",
      "paddingHorizontal",
      "paddingLeft",
      "paddingTop",
      "width",
    ] as const;

    for (const styleName of [
      "bubble",
      "incomingBubble",
      "outgoingBubble",
      "incomingBubbleTail",
      "outgoingBubbleTail",
      "messageRow",
      "messageContent",
      "messageContentOwn",
      "reactionPill",
      "reactionRow",
      "header",
      "messageFlow",
    ]) {
      for (const key of geometryKeys) {
        expect([styleName, key, dark[styleName]?.[key]]).toEqual([
          styleName,
          key,
          light[styleName]?.[key],
        ]);
      }
    }
  });

  it("drops the incoming bubble shadow in the dark theme", () => {
    // §2 "1h".1: `#1E2235` is enough ground on dark; a shadow there is mud.
    expect(darkTheme.elevation.messageBubbleIn.shadowOpacity).toBe(0);
    expect(lightTheme.elevation.messageBubbleIn.shadowOpacity).toBeGreaterThan(0);
    expect(darkTheme.messaging.replyQuoteRule).toBe("#7C74FF");
    expect(darkTheme.messaging.replyQuoteName).toBe("#A5A8FF");
    expect(darkTheme.messaging.replyQuoteText).toBe("rgba(255,255,255,.5)");
    expect(darkTheme.messaging.recordDot).toBe("#FF5A6A");
  });
});
