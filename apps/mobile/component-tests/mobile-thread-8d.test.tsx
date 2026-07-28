import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, waitFor } from "@testing-library/react-native";
import type { ChatMessage, MobileChannelThreadMessagesResponse } from "@wizards/types";

const mockRequestJson = jest.fn<(path: string, options?: unknown) => Promise<unknown>>();

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
import { activeMobileCopy as copy } from "../src/locale/mobile-locale-preferences";
import {
  applyMobileOptimisticThreadReply,
  shouldRenderMobileMessageInChannelStream,
} from "../src/query/mobile-message-cache";
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

describe("8d thread screen", () => {
  it("renders the header count, root card, reply divider and indented replies", async () => {
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
    expect(
      view.getByText(
        copy.messageThreadHeaderTemplate.replace("{channel}", "genel").replace("{count}", "2"),
      ),
    ).toBeTruthy();
    expect(
      view.getByText(copy.messageThreadReplySectionTemplate.replace("{count}", "2")),
    ).toBeTruthy();
    expect(view.getByTestId("mobile-thread-reply-reply-1")).toBeTruthy();
    expect(view.getByTestId("mobile-message-reaction-reply-2-💯")).toBeTruthy();
    // MSG-1f replaced the close button with the back chevron the handoff draws.
    expect(view.getByLabelText(copy.channelBackAction)).toBeTruthy();
  });

  it("sends a reply with alsoSendToChannel from its checked default", async () => {
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

    const input = view.getByTestId("mobile-dm-composer-input");
    await fireEvent.changeText(input, "thread yanıtı");
    await fireEvent.press(view.getByTestId("mobile-dm-send-button"));

    await waitFor(() =>
      expect(mockRequestJson).toHaveBeenCalledWith(
        "/api/v1/mobile/channels/channel-1/messages",
        expect.objectContaining({
          body: expect.objectContaining({
            alsoSendToChannel: true,
            content: "thread yanıtı",
            threadParentId: "root-message",
          }),
        }),
      ),
    );

    await fireEvent.press(view.getByTestId("mobile-thread-also-send-toggle"));
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

  it("keeps plain thread replies out of the channel stream", () => {
    expect(shouldRenderMobileMessageInChannelStream(createMessage("plain"))).toBe(true);
    expect(
      shouldRenderMobileMessageInChannelStream(
        createMessage("thread-only", { threadParentId: "root-message" }),
      ),
    ).toBe(false);
    expect(
      shouldRenderMobileMessageInChannelStream(
        createMessage("mirrored", {
          alsoSentToChannel: true,
          threadParentId: "root-message",
        }),
      ),
    ).toBe(true);
  });

  it("bumps the parent's thread summary optimistically", () => {
    const data = {
      pageParams: [null],
      pages: [
        {
          channel: null as never,
          hasMore: false,
          messages: [createMessage("root-message")],
          nextCursor: null,
        },
      ],
    };

    const next = applyMobileOptimisticThreadReply(
      data,
      "root-message",
      { avatarUrl: null, displayName: "Ben", userId: "user-1", username: "dogukanyazar" },
      "2026-07-21T14:00:00.000Z",
    );

    expect(next?.pages[0]?.messages[0]?.threadSummary).toEqual({
      lastReplyAt: "2026-07-21T14:00:00.000Z",
      recentRepliers: [
        { avatarUrl: null, displayName: "Ben", userId: "user-1", username: "dogukanyazar" },
      ],
      replyCount: 1,
    });
  });

  it("removes the own reaction from the thread detail sheet optimistically", async () => {
    mockRequestJson.mockImplementation(async (_path, options) => {
      if (typeof options === "object" && options !== null && "method" in options) {
        return { reactions: [] };
      }
      return createThreadPayload([
        createMessage("reply-own-reaction", {
          reactions: [
            {
              count: 1,
              emoji: "🎉",
              userIds: ["user-1"],
              users: [
                {
                  avatarUrl: null,
                  displayName: "Ben",
                  id: "user-1",
                  reactedAt: "2026-07-21T13:58:00.000Z",
                  username: "dogukanyazar",
                },
              ],
            },
          ],
          threadParentId: "root-message",
        }),
      ]);
    });

    const view = await render(
      <MobileMessageThreadScreen
        channelName="genel"
        contextId="channel-1"
        messageId="root-message"
        onBack={jest.fn()}
      />,
    );

    const chip = await view.findByTestId("mobile-message-reaction-reply-own-reaction-🎉");
    await fireEvent(chip, "longPress");
    await fireEvent.press(view.getByTestId("mobile-message-reaction-detail-user-user-1"));

    await waitFor(() => {
      expect(view.queryByTestId("mobile-message-reaction-detail-sheet-panel")).toBeNull();
    });
  });
});
