import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { areMessageItemPropsEqual, type MessageItemProps } from "./message-item";

const stableHandler = () => undefined;

function makeProps(): MessageItemProps {
  return {
    authorColor: "hsl(var(--member-1))",
    canModerate: false,
    currentUserId: "viewer-1",
    isGrouped: false,
    message: {
      attachments: [],
      author: {
        avatarUrl: "https://cdn.example/avatar.png",
        customStatus: "Kod yazıyor",
        displayName: "Ada",
        id: "author-1",
        status: "ONLINE",
        username: "ada",
      },
      channelId: "channel-1",
      content: "Merhaba",
      createdAt: "2026-08-12T10:00:00.000Z",
      deletedAt: null,
      editedAt: null,
      id: "message-1",
      reactions: [],
      type: "DEFAULT",
    },
    mode: "channel",
    onReact: stableHandler,
    onRemoveOptimistic: stableHandler,
    onReply: stableHandler,
    onRetry: stableHandler,
    onThread: stableHandler,
    readReceipt: { count: 2, everyone: false },
  };
}

describe("MessageItem memo comparison", () => {
  it("keeps an unchanged row memoized even when its read-receipt object is recreated", () => {
    const previous = makeProps();
    const next: MessageItemProps = {
      ...previous,
      readReceipt: { count: 2, everyone: false },
    };

    assert.equal(areMessageItemPropsEqual(previous, next), true);
  });

  for (const testCase of [
    {
      name: "avatar URL",
      change: (props: ReturnType<typeof makeProps>) => ({
        ...props,
        message: {
          ...props.message,
          author: { ...props.message.author, avatarUrl: "https://cdn.example/new.png" },
        },
      }),
    },
    {
      name: "display name",
      change: (props: ReturnType<typeof makeProps>) => ({
        ...props,
        message: { ...props.message, author: { ...props.message.author, displayName: "Grace" } },
      }),
    },
    {
      name: "author colour",
      change: (props: ReturnType<typeof makeProps>) => ({
        ...props,
        authorColor: "hsl(var(--member-2))",
      }),
    },
    {
      name: "conversation mode",
      change: (props: ReturnType<typeof makeProps>) => ({ ...props, mode: "dm" as const }),
    },
    {
      name: "read receipt count",
      change: (props: ReturnType<typeof makeProps>) => ({
        ...props,
        readReceipt: { count: 3, everyone: false },
      }),
    },
    {
      name: "read receipt completion",
      change: (props: ReturnType<typeof makeProps>) => ({
        ...props,
        readReceipt: { count: 2, everyone: true },
      }),
    },
  ]) {
    it(`updates the row when ${testCase.name} changes`, () => {
      const previous = makeProps();

      assert.equal(areMessageItemPropsEqual(previous, testCase.change(previous)), false);
    });
  }
});
