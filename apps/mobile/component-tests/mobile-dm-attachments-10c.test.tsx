import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import type { MobileDMMessagesResponse } from "@wizards/types";

const mockVoiceRecorder = {
  discard: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  isRecording: false as boolean,
  phase: "idle" as const,
  start: jest.fn<() => Promise<"recording">>().mockResolvedValue("recording"),
  stop: jest.fn(),
};

jest.mock("../src/media/mobile-message-attachment-picker", () => ({
  pickMobileMessageAttachmentFromDocument: jest.fn(),
  pickMobileMessageAttachmentFromPhotoLibrary: jest.fn(),
}));

jest.mock("../src/media/mobile-message-attachment-upload", () => ({
  uploadMobileMessageAttachmentToUploadThing: jest.fn(),
}));

jest.mock("../src/media/mobile-voice-message-recorder", () => ({
  useMobileVoiceMessageRecorder: () => mockVoiceRecorder,
}));

jest.mock("../src/app/components/message-emoji-picker", () => {
  const ReactRuntime = require("react");
  const { View } = require("react-native");
  return {
    MessageEmojiPicker: ({ isOpen }: { isOpen: boolean }) =>
      isOpen
        ? ReactRuntime.createElement(View, { testID: "mobile-message-emoji-picker-panel" })
        : null,
  };
});

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");
  const chainable = () => {
    const gesture: Record<string, () => unknown> = {};
    for (const method of [
      "activeOffsetX",
      "averageTouches",
      "enabled",
      "failOffsetX",
      "failOffsetY",
      "maxDuration",
      "minDistance",
      "numberOfTaps",
      "onBegin",
      "onEnd",
      "onFinalize",
      "onStart",
      "onTouchesDown",
      "onUpdate",
      "requireExternalGestureToFail",
      "shouldCancelWhenOutside",
      "simultaneousWithExternalGesture",
      "withRef",
    ]) {
      gesture[method] = () => gesture;
    }
    return gesture;
  };

  return {
    Gesture: {
      Exclusive: (...gestures: unknown[]) => gestures[0],
      Native: chainable,
      Pan: chainable,
      Pinch: chainable,
      Race: (...gestures: unknown[]) => gestures[0],
      Simultaneous: (...gestures: unknown[]) => gestures[0],
      Tap: chainable,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, null, children),
  };
});

jest.mock("../src/app/components/kit/bottom-sheet", () => {
  const ReactRuntime = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ({
      children,
      open,
      testID,
    }: {
      children: React.ReactNode;
      open: boolean;
      testID: string;
    }) => (open ? ReactRuntime.createElement(View, { testID: `${testID}-panel` }, children) : null),
  };
});

import { DMChatMessageRow } from "../src/app/components/dm-chat-primitives";
import { DMComposer } from "../src/app/composer/mobile-composer";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { MobileMessageAttachmentUploadError } from "../src/media/mobile-message-attachment-contract";
import { pickMobileMessageAttachmentFromPhotoLibrary } from "../src/media/mobile-message-attachment-picker";
import { uploadMobileMessageAttachmentToUploadThing } from "../src/media/mobile-message-attachment-upload";
import { renderWithMobileTheme as render } from "./render-with-mobile-theme";

type DMMessage = MobileDMMessagesResponse["messages"][number];
type DMAttachment = DMMessage["attachments"][number];

const imageAttachment: DMAttachment = {
  contentType: "image/png",
  duration: null,
  filename: "holiday.png",
  height: 1200,
  id: "attachment-image",
  scanStatus: "CLEAN",
  size: 2048,
  thumbnailUrl: "https://cdn.example.test/holiday-thumb.png",
  url: "https://cdn.example.test/holiday.png",
  width: 900,
};

const fileAttachment: DMAttachment = {
  contentType: "application/pdf",
  duration: null,
  filename: "contract.pdf",
  height: null,
  id: "attachment-file",
  scanStatus: "CLEAN",
  size: 4096,
  thumbnailUrl: null,
  url: "https://cdn.example.test/contract.pdf",
  width: null,
};

function createMessage(overrides: Partial<DMMessage> = {}): DMMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      customStatus: null,
      displayName: "Partner",
      id: "partner",
      status: "ONLINE",
      username: "partner",
    },
    content: "",
    conversationId: "conversation-1",
    createdAt: "2026-07-23T08:00:00.000Z",
    deletedAt: null,
    deletedById: null,
    editedAt: null,
    id: "message-1",
    reactions: [],
    replyTo: null,
    replyToId: null,
    threadParentId: null,
    userId: "partner",
    ...overrides,
  } as DMMessage;
}

function renderRow(message: DMMessage, overrides: Record<string, unknown> = {}) {
  return render(
    <DMChatMessageRow
      currentUserId="me"
      isGroupedWithNext={false}
      isGroupedWithPrevious={false}
      isReactionMutationPending={false}
      message={message}
      partnerLastReadAt={null}
      showDateSeparator={false}
      {...overrides}
    />,
  );
}

describe("10c DM attachments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens a DM image attachment in the shared lightbox", async () => {
    const view = await renderRow(createMessage({ attachments: [imageAttachment] }));

    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
    await fireEvent.press(view.getByTestId(`mobile-message-image-${imageAttachment.id}`));
    expect(view.getByTestId("mobile-message-image-lightbox")).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-message-image-lightbox-close"));
    expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
  });

  it("opens a DM file attachment with the system handler", async () => {
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as unknown as boolean);
    const view = await renderRow(createMessage({ attachments: [fileAttachment] }));

    await fireEvent.press(view.getByTestId(`mobile-message-attachment-${fileAttachment.id}`));
    expect(openURL).toHaveBeenCalledWith(fileAttachment.url);
    openURL.mockRestore();
  });

  it("keeps the attachment card on a failed DM message and still offers retry", async () => {
    const onRetryFailedMessage = jest.fn();
    const view = await renderRow(
      createMessage({
        attachments: [imageAttachment],
        author: {
          avatarUrl: null,
          customStatus: null,
          displayName: "Me",
          id: "me",
          status: "ONLINE",
          username: "me",
        },
        deliveryStatus: "failed",
        id: "message-failed",
        userId: "me",
      }),
      { onRetryFailedMessage },
    );

    expect(view.getByTestId(`mobile-message-image-${imageAttachment.id}`)).toBeTruthy();
    await fireEvent.press(view.getByTestId("mobile-message-retry-message-failed"));
    expect(onRetryFailedMessage).toHaveBeenCalledWith("message-failed");
  });

  it("hands the uploaded attachment metadata to the DM send handler", async () => {
    const attachmentId = "6f1b6a52-6d5c-4ba0-93f2-4b3a7f52f4c2";
    const attachment = {
      contentType: "image/png",
      filename: "welcome.png",
      id: attachmentId,
      scanStatus: "PENDING" as const,
      size: 1024,
      url: "https://ufs.example.test/welcome.png",
    };
    jest.mocked(pickMobileMessageAttachmentFromPhotoLibrary).mockResolvedValue({
      file: {
        lastModified: 1,
        name: "welcome.png",
        size: 1024,
        type: "image/png",
        uri: "file:///cache/welcome.png",
      } as unknown as File,
      kind: "image",
      localUri: "file:///cache/welcome.png",
    });
    jest.mocked(uploadMobileMessageAttachmentToUploadThing).mockResolvedValue({
      attachment,
      input: { id: attachmentId },
      kind: "image",
      localUri: "file:///cache/welcome.png",
    });
    const onSend = jest
      .fn<(content: string, attachments?: unknown, previews?: unknown) => Promise<boolean>>()
      .mockResolvedValue(true);

    const view = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "mobile-access-token"}
        onSend={onSend}
        variant="dm"
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-dm-attach-button"));
    await fireEvent.press(view.getByTestId("mobile-dm-photo-library-picker"));
    expect(await view.findByTestId(`mobile-dm-attachment-draft-${attachmentId}`)).toBeTruthy();
    expect(view.getByTestId(`mobile-dm-attachment-thumbnail-${attachmentId}`)).toBeTruthy();

    await fireEvent.press(view.getByTestId("mobile-dm-send-button"));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("", [{ id: attachmentId }], [attachment]);
    });
  });

  it("explains an oversized DM attachment with the size-limit copy", async () => {
    jest.mocked(pickMobileMessageAttachmentFromPhotoLibrary).mockResolvedValue({
      file: {
        lastModified: 1,
        name: "huge.png",
        size: 32 * 1024 * 1024,
        type: "image/png",
        uri: "file:///cache/huge.png",
      } as unknown as File,
      kind: "image",
      localUri: "file:///cache/huge.png",
    });
    jest
      .mocked(uploadMobileMessageAttachmentToUploadThing)
      .mockRejectedValue(new MobileMessageAttachmentUploadError("selected-file-too-large"));

    const view = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        getAccessToken={async () => "mobile-access-token"}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );

    await fireEvent.press(view.getByTestId("mobile-dm-attach-button"));
    await fireEvent.press(view.getByTestId("mobile-dm-photo-library-picker"));
    expect(await view.findByText(copy.composerAttachmentTooLarge)).toBeTruthy();
  });

  it("fails the DM attach control closed without an access token", async () => {
    const view = await render(
      <DMComposer
        attachmentsFeature={{ label: "Attachments", status: "available" }}
        onSend={jest.fn<() => Promise<boolean>>().mockResolvedValue(true)}
        variant="dm"
      />,
    );

    const attach = view.getByTestId("mobile-dm-attach-button");
    expect(attach.props.accessibilityState).toEqual({ disabled: true });
  });
});
