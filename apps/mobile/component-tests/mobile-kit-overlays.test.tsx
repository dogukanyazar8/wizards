import React from "react";
import { Alert, BackHandler, Pressable, Share, StyleSheet, Text } from "react-native";
import * as Clipboard from "expo-clipboard";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Easing, useReducedMotion, withTiming } from "react-native-reanimated";
import type { ChatMessage } from "@wizards/types";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";

let mockTheme: MobileTheme = lightTheme;
const mockBottomSystemSpacing = jest.fn(() => 0);
let mockGestureHandlers: {
  end?: (event: { translationY: number; velocityY: number }) => void;
  update?: (event: { translationY: number; velocityY: number }) => void;
} = {};

jest.mock("../src/app/providers/mobile-theme-provider", () => ({
  useTheme: () => mockTheme,
  useThemedStyles: (factory: (theme: MobileTheme) => Record<string, object>) => {
    const { StyleSheet } = require("react-native");
    return StyleSheet.create(factory(mockTheme));
  },
}));

jest.mock("../src/app/use-mobile-bottom-system-spacing", () => ({
  useMobileBottomSystemSpacing: (minimumSpacing: number) => mockBottomSystemSpacing(minimumSpacing),
}));

jest.mock("react-native-gesture-handler", () => {
  const ReactRuntime = require("react");
  const ReactNative = require("react-native");

  const chainable = () => {
    const gesture: Record<string, () => unknown> = {};
    for (const method of [
      "enabled",
      "maxDuration",
      "numberOfTaps",
      "onEnd",
      "onStart",
      "onUpdate",
    ]) {
      gesture[method] = () => gesture;
    }
    return gesture;
  };

  return {
    Gesture: {
      Exclusive: (...gestures: unknown[]) => gestures[0],
      Pinch: chainable,
      Pan: () => {
        const gesture = {
          enabled: () => gesture,
          onEnd: (handler: typeof mockGestureHandlers.end) => {
            mockGestureHandlers.end = handler;
            return gesture;
          },
          onStart: () => gesture,
          onUpdate: (handler: typeof mockGestureHandlers.update) => {
            mockGestureHandlers.update = handler;
            return gesture;
          },
        };
        return gesture;
      },
      Race: (...gestures: unknown[]) => gestures[0],
      Simultaneous: (...gestures: unknown[]) => gestures[0],
      Tap: chainable,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactNative.View, { testID: "mock-gesture-detector" }, children),
  };
});

import { ActionSheet, BottomSheet, ContextMenu, OptionSheet } from "../src/app/components/kit";
import { MOBILE_OVERLAY_CLOSE_DURATION_MS } from "../src/app/components/kit/overlay-surface";
import { MessageAttachmentList, MessagePreviewRow } from "../src/app/components/message-primitives";

/** Exit animations parked mid-flight so the closing panel can be inspected. */
let exitCompletions: ((finished: boolean) => void)[] = [];

/** Leaves the sheet in its closing phase until the test completes it. */
function holdExitAnimation() {
  jest.mocked(withTiming).mockImplementation(((
    value: unknown,
    _config: unknown,
    completion?: (finished: boolean) => void,
  ) => {
    if (completion) {
      exitCompletions.push(completion);
    }
    return value;
  }) as never);
}

beforeEach(() => {
  mockGestureHandlers = {};
  mockBottomSystemSpacing.mockReset();
  mockBottomSystemSpacing.mockReturnValue(0);
  jest.mocked(useReducedMotion).mockReturnValue(false);
  jest.mocked(Clipboard.setStringAsync).mockClear();
  exitCompletions = [];
  jest.mocked(withTiming).mockReset();
  jest.mocked(withTiming).mockImplementation(((
    value: unknown,
    _config: unknown,
    completion?: (finished: boolean) => void,
  ) => {
    completion?.(true);
    return value;
  }) as never);
});

for (const theme of [lightTheme, darkTheme]) {
  describe(`${theme.id} mobile overlay kit`, () => {
    it("closes BottomSheet from backdrop, Android back, and pan-down", async () => {
      mockTheme = theme;
      const onClose = jest.fn();
      let hardwareBackHandler: (() => boolean) | undefined;
      const removeBackHandler = jest.fn();
      jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
        hardwareBackHandler = handler;
        return { remove: removeBackHandler };
      });

      const view = await render(
        <BottomSheet accessibilityLabel="Actions" onClose={onClose} open testID="overlay-sheet">
          <Text>Sheet content</Text>
        </BottomSheet>,
      );

      const panel = view.getByTestId("overlay-sheet-panel");
      expect(panel.props.role).toBe("dialog");
      expect(StyleSheet.flatten(panel.props.style).backgroundColor).toBe(theme.surface.elevated);

      await fireEvent.press(view.getByTestId("overlay-sheet-backdrop"));
      expect(onClose).toHaveBeenCalledTimes(1);

      expect(hardwareBackHandler?.()).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(2);

      mockGestureHandlers.end?.({ translationY: 280, velocityY: 1_100 });
      expect(onClose).toHaveBeenCalledTimes(3);
      await view.unmount();
      expect(removeBackHandler).toHaveBeenCalledTimes(1);
    });

    it("keeps BottomSheet controls above a three-button Android navigation bar", async () => {
      mockTheme = theme;
      mockBottomSystemSpacing.mockReturnValue(48);
      const view = await render(
        <BottomSheet accessibilityLabel="Actions" onClose={jest.fn()} open testID="inset-sheet">
          <Text>Sheet content</Text>
        </BottomSheet>,
      );

      expect(mockBottomSystemSpacing).toHaveBeenCalledWith(0);
      expect(StyleSheet.flatten(view.getByTestId("inset-sheet-panel").props.style)).toMatchObject({
        paddingBottom: theme.spacing.page + 48,
      });
    });

    it("renders nothing while BottomSheet is closed and uses immediate reduced-motion state", async () => {
      mockTheme = theme;
      jest.mocked(useReducedMotion).mockReturnValue(true);
      const view = await render(
        <BottomSheet
          accessibilityLabel="Actions"
          onClose={jest.fn()}
          open={false}
          testID="closed-sheet"
        >
          <Text>Hidden content</Text>
        </BottomSheet>,
      );

      expect(view.queryByTestId("closed-sheet-panel")).toBeNull();
      expect(view.queryByText("Hidden content")).toBeNull();
    });

    it("slides the panel out and fades the backdrop before unmounting the sheet", async () => {
      mockTheme = theme;
      holdExitAnimation();
      const view = await render(
        <BottomSheet accessibilityLabel="Actions" onClose={jest.fn()} open testID="exit-sheet">
          <Text>Opened content</Text>
        </BottomSheet>,
      );

      expect(
        StyleSheet.flatten(view.getByTestId("exit-sheet-backdrop").props.style),
      ).toMatchObject({ opacity: 1 });

      await view.rerender(
        <BottomSheet
          accessibilityLabel="Actions"
          onClose={jest.fn()}
          open={false}
          testID="exit-sheet"
        >
          <Text>Content the screen already cleared</Text>
        </BottomSheet>,
      );

      // Still on screen, running the exit animation with the content it opened
      // with — the screen is free to drop its selection on close.
      expect(view.getByTestId("exit-sheet-panel")).toBeTruthy();
      expect(view.getByText("Opened content")).toBeTruthy();
      expect(withTiming).toHaveBeenCalledWith(
        420,
        { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic) },
        expect.any(Function),
      );
      expect(
        StyleSheet.flatten(view.getByTestId("exit-sheet-backdrop").props.style),
      ).toMatchObject({ opacity: 0 });

      await act(async () => {
        exitCompletions.at(-1)?.(true);
      });

      expect(view.queryByTestId("exit-sheet-panel")).toBeNull();
      expect(view.queryByText("Opened content")).toBeNull();
    });

    it("animates a content-sized sheet over its measured height instead of a snap point", async () => {
      mockTheme = theme;
      holdExitAnimation();
      const view = await render(
        <BottomSheet
          accessibilityLabel="Servers"
          onClose={jest.fn()}
          open
          presentation={{ panelStyle: { maxHeight: "78%" } }}
          sizing="content"
          testID="content-sheet"
        >
          <Text>Server list</Text>
        </BottomSheet>,
      );

      const panel = view.getByTestId("content-sheet-panel");
      // No fixed height: the panel is as tall as its content, up to the cap.
      expect(StyleSheet.flatten(panel.props.style).height).toBeUndefined();
      expect(StyleSheet.flatten(panel.props.style).maxHeight).toBe("78%");

      await fireEvent(panel, "layout", { nativeEvent: { layout: { height: 612 } } });
      await view.rerender(
        <BottomSheet
          accessibilityLabel="Servers"
          onClose={jest.fn()}
          open={false}
          presentation={{ panelStyle: { maxHeight: "78%" } }}
          sizing="content"
          testID="content-sheet"
        >
          <Text>Server list</Text>
        </BottomSheet>,
      );

      expect(withTiming).toHaveBeenCalledWith(
        612,
        { duration: MOBILE_OVERLAY_CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic) },
        expect.any(Function),
      );

      await act(async () => {
        exitCompletions.at(-1)?.(true);
      });
      expect(view.queryByTestId("content-sheet-panel")).toBeNull();
    });

    it("drops the sheet without an exit animation under reduced motion", async () => {
      mockTheme = theme;
      jest.mocked(useReducedMotion).mockReturnValue(true);
      const view = await render(
        <BottomSheet accessibilityLabel="Actions" onClose={jest.fn()} open testID="static-sheet">
          <Text>Opened content</Text>
        </BottomSheet>,
      );
      expect(view.getByTestId("static-sheet-panel")).toBeTruthy();

      await view.rerender(
        <BottomSheet
          accessibilityLabel="Actions"
          onClose={jest.fn()}
          open={false}
          testID="static-sheet"
        >
          <Text>Opened content</Text>
        </BottomSheet>,
      );

      expect(view.queryByTestId("static-sheet-panel")).toBeNull();
      expect(withTiming).not.toHaveBeenCalled();
    });

    it("supports a screen-specific backdrop blur and panel presentation without changing dismissal ownership", async () => {
      mockTheme = theme;
      const view = await render(
        <BottomSheet
          accessibilityLabel="Language selection"
          onClose={jest.fn()}
          open
          presentation={{
            backdropBlurIntensity: 2,
            backdropStyle: { backgroundColor: theme.authLanguage.backdrop },
            contentStyle: { paddingHorizontal: 0 },
            handleStyle: { height: 5, width: 40 },
            panelStyle: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 0 },
          }}
          testID="presented-sheet"
        >
          <Text>Language content</Text>
        </BottomSheet>,
      );

      expect(view.getByTestId("mobile-blur-view").props.intensity).toBe(2);
      expect(
        StyleSheet.flatten(view.getByTestId("presented-sheet-backdrop").props.style),
      ).toMatchObject({
        backgroundColor: theme.authLanguage.backdrop,
      });
      expect(
        StyleSheet.flatten(view.getByTestId("presented-sheet-panel").props.style),
      ).toMatchObject({
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderWidth: 0,
      });
    });

    it("opens ContextMenu on long press and closes after an accessible action", async () => {
      mockTheme = theme;
      const onAction = jest.fn();
      const view = await render(
        <ContextMenu
          accessibilityLabel="Message actions"
          actions={[
            { id: "reply", label: "Reply", onPress: onAction },
            { destructive: true, id: "delete", label: "Delete", onPress: jest.fn() },
          ]}
          testID="message-menu"
        >
          <Text>Open menu</Text>
        </ContextMenu>,
      );

      await fireEvent(view.getByTestId("message-menu-trigger"), "longPress");

      expect(view.getByTestId("message-menu-options").props.accessibilityRole).toBe("menu");
      const reply = view.getByLabelText("Reply");
      expect(reply.props.accessibilityRole).toBe("menuitem");
      await fireEvent.press(reply);

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(view.queryByTestId("message-menu-options")).toBeNull();
    });

    it("sizes an OptionSheet to its rows and reports the checked option back", async () => {
      mockTheme = theme;
      const onSelect = jest.fn();
      const view = await render(
        <OptionSheet
          onClose={jest.fn()}
          onSelect={onSelect}
          open
          options={[
            { description: "Anyone on Whispr", icon: "globe-outline", label: "Everyone", value: "EVERYONE" },
            { icon: "lock-closed-outline", label: "Nobody", tone: "neutral", value: "NOBODY" },
          ]}
          selectedValue="NOBODY"
          subtitle="Who can see your profile"
          testID="policy"
          title="Profile visibility"
        />,
      );

      // A content-sized panel never carries a fixed height, which is what kept
      // the old fixed sheets taller than the rows they render.
      expect(StyleSheet.flatten(view.getByTestId("policy-panel").props.style).height).toBeUndefined();
      expect(view.getByTestId("policy-options").props.accessibilityRole).toBe("radiogroup");
      expect(view.getByTestId("policy-NOBODY").props.accessibilityState.checked).toBe(true);
      expect(view.getByTestId("policy-EVERYONE").props.accessibilityState.checked).toBe(false);
      expect(view.getByLabelText("Everyone. Anyone on Whispr")).toBeTruthy();

      await fireEvent.press(view.getByTestId("policy-EVERYONE"));
      expect(onSelect).toHaveBeenCalledWith("EVERYONE");
    });

    it("dismisses an ActionSheet before running the action it was tapped for", async () => {
      mockTheme = theme;
      const order: string[] = [];
      const onClose = jest.fn(() => order.push("close"));
      const view = await render(
        <ActionSheet
          actions={[
            {
              icon: "image-outline",
              id: "photo",
              label: "Photo",
              onPress: () => order.push("action"),
            },
          ]}
          onClose={onClose}
          open
          testID="attach"
          title="Attach"
        />,
      );

      expect(view.getByTestId("attach-actions").props.accessibilityRole).toBe("menu");
      await fireEvent.press(view.getByTestId("attach-photo"));
      expect(order).toEqual(["close", "action"]);
    });

    it("opens a message reaction menu and toggles the selected emoji", async () => {
      mockTheme = theme;
      const onToggleReaction = jest.fn();
      const message: ChatMessage = {
        attachments: [],
        author: {
          avatarUrl: null,
          displayName: "Ada",
          id: "user-2",
          status: "ONLINE",
          username: "ada",
        },
        channelId: "channel-1",
        content: "Merhaba",
        createdAt: "2026-07-11T10:00:00.000Z",
        deletedAt: null,
        editedAt: null,
        id: "message-1",
        mentionEveryone: false,
        reactions: [{ count: 1, emoji: "🔥", userIds: ["user-3"] }],
        type: "DEFAULT",
      };
      const view = await render(
        <MessagePreviewRow message={message} onToggleReaction={onToggleReaction} />,
      );

      await fireEvent(view.getByTestId("mobile-message-actions-message-1-trigger"), "longPress");
      await fireEvent.press(view.getByLabelText("👍 ile tepki ver"));

      expect(onToggleReaction).toHaveBeenCalledWith({
        emoji: "👍",
        messageId: "message-1",
        shouldReact: true,
      });

      await fireEvent(view.getByTestId("mobile-message-actions-message-1-trigger"), "longPress");
      await fireEvent.press(view.getByLabelText(copy.messageEmojiPickerAction));
      expect(view.getByTestId("mobile-message-emoji-picker-panel")).toBeTruthy();
      await fireEvent.press(view.getByLabelText("😀"));
      expect(onToggleReaction).toHaveBeenLastCalledWith({
        emoji: "😀",
        messageId: "message-1",
        shouldReact: true,
      });
      await fireEvent.press(view.getByTestId("mobile-message-reaction-message-1-🔥"));
      expect(onToggleReaction).toHaveBeenLastCalledWith({
        emoji: "🔥",
        messageId: "message-1",
        shouldReact: true,
      });
    });

    it("copies a message to the native clipboard without opening the share sheet", async () => {
      mockTheme = theme;
      const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "dismissedAction" });
      const message: ChatMessage = {
        attachments: [],
        author: {
          avatarUrl: null,
          displayName: "Ada",
          id: "user-2",
          status: "ONLINE",
          username: "ada",
        },
        channelId: "channel-1",
        content: "Copy this message",
        createdAt: "2026-07-11T10:00:00.000Z",
        deletedAt: null,
        editedAt: null,
        id: "message-copy",
        mentionEveryone: false,
        reactions: [],
        type: "DEFAULT",
      };
      const view = await render(<MessagePreviewRow message={message} />);

      await fireEvent(view.getByTestId("mobile-message-actions-message-copy-trigger"), "longPress");
      await fireEvent.press(view.getByLabelText(copy.messageCopyAction));

      expect(Clipboard.setStringAsync).toHaveBeenCalledWith("Copy this message");
      expect(share).not.toHaveBeenCalled();
      share.mockRestore();
    });

    it("shows a bounded error when copying a message fails", async () => {
      mockTheme = theme;
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
      jest
        .mocked(Clipboard.setStringAsync)
        .mockRejectedValueOnce(new Error("clipboard unavailable"));
      const message: ChatMessage = {
        attachments: [],
        author: {
          avatarUrl: null,
          displayName: "Ada",
          id: "user-2",
          status: "ONLINE",
          username: "ada",
        },
        channelId: "channel-1",
        content: "Copy this message",
        createdAt: "2026-07-11T10:00:00.000Z",
        deletedAt: null,
        editedAt: null,
        id: "message-copy-failure",
        mentionEveryone: false,
        reactions: [],
        type: "DEFAULT",
      };
      const view = await render(<MessagePreviewRow message={message} />);

      await fireEvent(
        view.getByTestId("mobile-message-actions-message-copy-failure-trigger"),
        "longPress",
      );
      await fireEvent.press(view.getByLabelText(copy.messageCopyAction));

      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith(expect.any(String), expect.any(String)),
      );
      alert.mockRestore();
    });

    it("gates edit and delete to the author and confirms destructive deletion", async () => {
      mockTheme = theme;
      const onDeleteMessage = jest.fn();
      const onEditMessage = jest.fn();
      const onReplyMessage = jest.fn();
      const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
        buttons?.find((button) => button.style === "destructive")?.onPress?.();
      });
      const message: ChatMessage = {
        attachments: [],
        author: {
          avatarUrl: null,
          displayName: "Ada",
          id: "user-1",
          status: "ONLINE",
          username: "ada",
        },
        channelId: "channel-1",
        content: "Own message",
        createdAt: "2026-07-11T10:00:00.000Z",
        deletedAt: null,
        editedAt: null,
        id: "message-own",
        mentionEveryone: false,
        reactions: [],
        type: "DEFAULT",
      };
      const view = await render(
        <MessagePreviewRow
          currentUserId="user-1"
          message={message}
          onDeleteMessage={onDeleteMessage}
          onEditMessage={onEditMessage}
          onReplyMessage={onReplyMessage}
          own
        />,
      );

      await fireEvent(view.getByTestId("mobile-message-actions-message-own-trigger"), "longPress");
      await fireEvent.press(view.getByLabelText(copy.messageReplyAction));
      expect(onReplyMessage).toHaveBeenCalledWith({
        authorLabel: "Ada",
        content: "Own message",
        id: "message-own",
      });
      await fireEvent(view.getByTestId("mobile-message-actions-message-own-trigger"), "longPress");
      await fireEvent.press(view.getByLabelText(copy.messageEditAction));
      expect(onEditMessage).toHaveBeenCalledWith({ content: "Own message", id: "message-own" });
      await fireEvent(view.getByTestId("mobile-message-actions-message-own-trigger"), "longPress");
      await fireEvent.press(view.getByLabelText(copy.messageDeleteAction));
      expect(alert).toHaveBeenCalledTimes(1);
      expect(onDeleteMessage).toHaveBeenCalledWith("message-own");
      alert.mockRestore();
    });

    it("opens image attachments in the reduced-motion-aware lightbox", async () => {
      mockTheme = theme;
      const view = await render(
        <MessageAttachmentList
          attachments={[
            {
              contentType: "image/png",
              duration: null,
              filename: "proof.png",
              height: 600,
              id: "attachment-1",
              scanStatus: "CLEAN",
              size: 1024,
              thumbnailUrl: "https://cdn.example.com/proof-thumb.png",
              url: "https://cdn.example.com/proof.png",
              width: 800,
            },
          ]}
        />,
      );

      await fireEvent.press(view.getByTestId("mobile-message-image-attachment-1"));
      expect(view.getByTestId("mobile-message-image-lightbox")).toBeTruthy();
      await fireEvent.press(view.getByTestId("mobile-message-image-lightbox-close"));
      expect(view.queryByTestId("mobile-message-image-lightbox")).toBeNull();
    });
  });
}
