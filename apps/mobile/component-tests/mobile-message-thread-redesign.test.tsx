import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { StyleSheet } from "react-native";
import { fireEvent, waitFor } from "@testing-library/react-native";
import type { ChatMessage, MobileChannelThreadMessagesResponse } from "@wizards/types";

const mockRequestJson = jest.fn<(path: string, options?: unknown) => Promise<unknown>>();

jest.mock("@shopify/flash-list", () => {
  const ReactRuntime = jest.requireActual<typeof import("react")>("react");
  const ReactNative = jest.requireActual<typeof import("react-native")>("react-native");
  const renderSlot = (slot: any) =>
    typeof slot === "function" ? ReactRuntime.createElement(slot) : slot;
  return {
    FlashList: ({
      data = [],
      keyExtractor,
      ListEmptyComponent,
      ListFooterComponent,
      ListHeaderComponent,
      renderItem,
      ...props
    }: any) => (
      <ReactNative.View {...props} data={data}>
        {renderSlot(ListHeaderComponent)}
        {data.length === 0
          ? renderSlot(ListEmptyComponent)
          : data.map((item: unknown, index: number) => (
              <ReactRuntime.Fragment key={keyExtractor?.(item, index) ?? index}>
                {renderItem?.({ index, item })}
              </ReactRuntime.Fragment>
            ))}
        {renderSlot(ListFooterComponent)}
      </ReactNative.View>
    ),
  };
});

jest.mock("../src/auth/mobile-auth-context", () => ({
  useMobileAuth: () => ({
    apiClient: { requestJson: mockRequestJson },
    getAccessToken: async () => "access-token",
    session: {
      user: {
        avatarUrl: null,
        displayName: "Ben",
        id: "user-1",
        username: "dogukanyazar",
      },
    },
    status: "signed-in",
  }),
}));

import { MobileMessageThreadScreen } from "../src/app/screens/message-thread-screen";
import { createMessageThreadStyles } from "../src/app/screens/message-thread-screen.styles";
import { createMessagePrimitiveStyles } from "../src/app/components/message-primitives.styles";
import { mobileMessagingMetrics } from "../src/design/tokens";
import { darkTheme, lightTheme } from "../src/design/themes";
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import { renderWithMobileQueryTheme as render } from "./render-with-mobile-query-theme";

function createMessage(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    attachments: [],
    author: {
      avatarUrl: null,
      displayName: "Ayşegül",
      id: "user-2",
      status: "ONLINE",
      username: "aysegul_dev",
    },
    channelId: "channel-1",
    content: `içerik-${id}`,
    createdAt: "2026-07-21T13:42:00.000Z",
    deletedAt: null,
    editedAt: null,
    id,
    mentionEveryone: false,
    reactions: [],
    type: "DEFAULT",
    ...overrides,
  };
}

function createThreadPayload(replies: readonly ChatMessage[]): MobileChannelThreadMessagesResponse {
  return {
    hasMore: false,
    messages: [...replies],
    nextCursor: null,
    parent: createMessage("root-message", {
      reactions: [{ count: 4, emoji: "🎉", userIds: ["user-3"] }],
    }),
  };
}

describe("MSG-1f thread redesign", () => {
  it("virtualizes each reply as its own typed cell", async () => {
    mockRequestJson.mockResolvedValue(
      createThreadPayload([createMessage("reply-1"), createMessage("reply-2")]),
    );
    const view = await render(
      <MobileMessageThreadScreen
        contextId="channel-1"
        messageId="root-message"
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => expect(view.getByTestId("mobile-thread-reply-list")).toBeTruthy());
    const list = view.getByTestId("mobile-thread-reply-list");
    expect(list.props.data).toHaveLength(2);
    expect(list.props.data.map((item: unknown) => list.props.getItemType(item))).toEqual([
      "reply",
      "reply",
    ]);
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("puts the %s source block on the screen tone between two rules", (_scheme, theme) => {
    const styles = createMessageThreadStyles(theme);

    expect(styles.screen).toMatchObject({ backgroundColor: theme.messaging.surface });
    expect(styles.header).toMatchObject({
      backgroundColor: theme.messaging.surface,
      borderBottomWidth: 0,
    });
    // §2 "1f".2 asks for 12/16/14 around a channel row. The row itself brings
    // 16 horizontal and 6 vertical, so the block only adds the remainder.
    expect(styles.rootCard).toMatchObject({
      backgroundColor: theme.messaging.screen,
      borderBottomColor: theme.messaging.divider,
      borderBottomWidth: 1,
      borderTopColor: theme.messaging.divider,
      borderTopWidth: 1,
      paddingBottom: 8,
      paddingHorizontal: 0,
      paddingTop: 6,
    });
    expect(styles.rootCard.paddingTop + mobileMessagingMetrics.channel.rowPaddingVertical).toBe(12);
    expect(styles.rootCard.paddingBottom + mobileMessagingMetrics.channel.rowPaddingVertical).toBe(
      14,
    );
    // §2 "1f".1: the follow control is a pill, not a 38px square.
    expect(styles.followPill).toMatchObject({
      backgroundColor: theme.messaging.accentSoft,
      height: 38,
      paddingHorizontal: 12,
    });
    expect(styles.followPillLabel).toMatchObject({
      color: theme.messaging.accentText,
      fontSize: 12,
    });
    expect(styles.replySectionLabel).toMatchObject({
      color: theme.messaging.groupLabel,
      fontSize: 10.5,
    });
    expect(styles.replySectionLine).toMatchObject({ backgroundColor: theme.messaging.divider });
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)("keeps the %s thread chips on the surface tone", (_scheme, theme) => {
    const messages = createMessagePrimitiveStyles(theme);

    // §2 "1f".2: on the screen-tone source block the other chips flip to surface.
    expect(messages.messageReactionChipChannelOnScreen).toMatchObject({
      backgroundColor: theme.messaging.surface,
    });
  });

  it.each([
    ["light", lightTheme],
    ["dark", darkTheme],
  ] as const)(
    "checks the %s also-send box by default and hollows it when off",
    (_scheme, theme) => {
      const styles = createMessageThreadStyles(theme);

      expect(styles.alsoSendCheckboxChecked).toMatchObject({
        backgroundColor: theme.messaging.accent,
        borderColor: theme.messaging.accent,
      });
      expect(styles.alsoSendCheckbox).toMatchObject({
        backgroundColor: theme.messaging.field,
        borderRadius: 6,
        borderStyle: "dashed",
        height: 19,
        width: 19,
      });
      expect(styles.alsoSendLabel).toMatchObject({
        color: theme.messaging.textTertiary,
        fontSize: 12,
      });
    },
  );

  it("renders the thread header, source block and channel-format replies", async () => {
    mockRequestJson.mockResolvedValue(
      createThreadPayload([
        createMessage("reply-1", {
          author: {
            avatarUrl: null,
            displayName: "Ogi",
            id: "user-3",
            status: "ONLINE",
            username: "ogi_uat",
          },
          content: "Denedim, çok akıcı",
          threadParentId: "root-message",
        }),
        createMessage("reply-2", {
          content: "Tepki sayacına basınca liste açılsın mı?",
          reactions: [{ count: 3, emoji: "💯", userIds: ["user-1"] }],
          threadParentId: "root-message",
        }),
      ]),
    );

    const view = await render(
      <MobileMessageThreadScreen
        channelName="genel"
        contextId="channel-1"
        messageId="root-message"
        onBack={jest.fn()}
      />,
    );

    expect(await view.findByTestId("mobile-thread-root-message")).toBeTruthy();
    expect(view.getByText(copy.messageThreadTitle)).toBeTruthy();
    expect(
      view.getByText(
        copy.messageThreadHeaderTemplate.replace("{channel}", "genel").replace("{count}", "2"),
      ),
    ).toBeTruthy();
    expect(view.getByTestId("mobile-thread-follow-toggle")).toBeTruthy();
    expect(view.getByTestId("mobile-thread-options-button")).toBeTruthy();
    expect(view.getByLabelText(copy.channelBackAction)).toBeTruthy();
    expect(
      view.getByText(copy.messageThreadReplySectionTemplate.replace("{count}", "2")),
    ).toBeTruthy();
    // §2 "1f".4: replies are channel rows, not a second reply layout.
    expect(view.getByTestId("mobile-channel-message-bubble-reply-1")).toBeTruthy();
    expect(
      StyleSheet.flatten(view.getByTestId("mobile-channel-message-row-reply-1").props.style),
    ).toMatchObject({ paddingHorizontal: 16, paddingVertical: 6 });
    expect(view.getByTestId("mobile-message-reaction-reply-2-💯")).toBeTruthy();
  });

  it("sends the also-send flag from its checked default and clears it when unticked", async () => {
    mockRequestJson.mockImplementation(async (path, options) => {
      if (typeof options === "object" && options !== null && "method" in options) {
        return { message: createMessage("sent-reply", { threadParentId: "root-message" }) };
      }
      return createThreadPayload([]);
    });

    const view = await render(
      <MobileMessageThreadScreen
        channelName="genel"
        contextId="channel-1"
        messageId="root-message"
        onBack={jest.fn()}
      />,
    );

    expect(await view.findByText(copy.messageThreadEmptyPrompt)).toBeTruthy();
    const toggle = view.getByTestId("mobile-thread-also-send-toggle");
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });

    const input = view.getByTestId("mobile-dm-composer-input");
    await fireEvent.changeText(input, "kanala da gitsin");
    await fireEvent.press(view.getByTestId("mobile-dm-send-button"));

    await waitFor(() =>
      expect(mockRequestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/channels/channel-1/messages",
        expect.objectContaining({
          body: expect.objectContaining({
            alsoSendToChannel: true,
            content: "kanala da gitsin",
            threadParentId: "root-message",
          }),
        }),
      ),
    );

    await fireEvent.press(toggle);
    await fireEvent.changeText(input, "sadece thread");
    await fireEvent.press(view.getByTestId("mobile-dm-send-button"));

    await waitFor(() =>
      expect(mockRequestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/channels/channel-1/messages",
        expect.objectContaining({
          body: expect.objectContaining({
            alsoSendToChannel: false,
            content: "sadece thread",
          }),
        }),
      ),
    );
  });
});
