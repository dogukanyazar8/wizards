import React from "react";
import { describe, expect, it, jest } from "@jest/globals";

import {
  DMChatMessageRow,
  areDMChatMessageRowPropsEqual,
  getDMChatMessageItemType,
  type DMChatMessage,
  type DMChatMessageGroupItem,
} from "../src/app/components/dm-chat-primitives";

const message = {
  attachments: [],
  author: { avatarUrl: null, displayName: "Ada", id: "user-1", username: "ada" },
  content: "hello",
  createdAt: "2026-07-31T12:00:00.000Z",
  deletedAt: null,
  deliveryStatus: undefined,
  editedAt: null,
  forwardedAt: null,
  id: "message-1",
  reactions: [],
  replyTo: null,
  userId: "user-1",
} as unknown as DMChatMessage;

function rowProps(
  overrides: Partial<React.ComponentProps<typeof DMChatMessageRow>> = {},
): React.ComponentProps<typeof DMChatMessageRow> {
  return {
    currentUserId: "viewer",
    isGroupedWithNext: false,
    isGroupedWithPrevious: false,
    isReactionMutationPending: false,
    message,
    partnerLastReadAt: null,
    showAvatar: true,
    showDateSeparator: false,
    tailCorner: true,
    ...overrides,
  };
}

describe("DM FlashList row memoization", () => {
  it("skips a recreated grouping wrapper when every rendered dependency is stable", () => {
    expect(areDMChatMessageRowPropsEqual(rowProps(), rowProps())).toBe(true);
  });

  it("does not hide reaction or edit updates", () => {
    const reacted = {
      ...message,
      reactions: [{ count: 1, emoji: "👍", userIds: ["viewer"] }],
    } as DMChatMessage;
    const edited = { ...message, content: "edited", editedAt: "2026-07-31T12:01:00.000Z" };

    expect(areDMChatMessageRowPropsEqual(rowProps(), rowProps({ message: reacted }))).toBe(false);
    expect(areDMChatMessageRowPropsEqual(rowProps(), rowProps({ message: edited }))).toBe(false);
  });

  it("does not hide read receipts or handler changes", () => {
    expect(
      areDMChatMessageRowPropsEqual(
        rowProps(),
        rowProps({ partnerLastReadAt: "2026-07-31T12:02:00.000Z" }),
      ),
    ).toBe(false);
    expect(areDMChatMessageRowPropsEqual(rowProps(), rowProps({ onOpenThread: jest.fn() }))).toBe(
      false,
    );
  });

  it("returns only bounded recycling types for heterogeneous rows", () => {
    const item = rowProps() as DMChatMessageGroupItem;
    expect(getDMChatMessageItemType(item)).toBe("text");
    expect(
      getDMChatMessageItemType({
        ...item,
        message: { ...message, attachments: [{ kind: "FILE" }] } as DMChatMessage,
      }),
    ).toBe("attachment");
    expect(getDMChatMessageItemType({ ...item, showDateSeparator: true })).toBe("date");
  });
});
