import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import {
  resolveDMMentionedUserIds,
  sendDirectMessage,
  type SendAuthConversationRow,
  type SendDirectMessageDependencies,
} from "./message-send-service";

const JOINED_AT = new Date("2026-08-01T09:00:00.000Z");
const SENT_AT = new Date("2026-08-11T12:00:00.000Z");

function conversationRow(
  overrides: Partial<SendAuthConversationRow> = {},
): SendAuthConversationRow {
  return {
    disappearingAfter: "OFF",
    historyVisibility: "LAST_30D",
    id: "group-1",
    ownerId: "owner-1",
    participants: [
      {
        historyFromAt: null,
        joinedAt: JOINED_AT,
        notifyLevel: "ALL",
        pinnedStripDismissedId: null,
        role: "MEMBER",
        userId: "member-1",
      },
    ],
    permAddMembers: "ALL",
    permEditInfo: "ADMINS",
    permPinMessage: "ADMINS",
    permSendMessage: "ALL",
    pinnedMessageId: null,
    type: "GROUP_DM",
    ...overrides,
  };
}

/**
 * A create that never touches the database. Whatever reaches it is what would
 * have been written, which is how the disappearing stamp is asserted below.
 */
function stubCreateMessage(
  captured: Array<{ expiresAt?: Date | null }>,
): SendDirectMessageDependencies["createMessage"] {
  return (async (args: { expiresAt?: Date | null }) => {
    captured.push(args);

    return {
      deduplicated: false,
      message: {
        attachments: [],
        author: {
          avatarUrl: null,
          customStatus: null,
          displayName: "Member",
          id: "member-1",
          status: "ONLINE",
          username: "member",
        },
        content: "Merhaba",
        conversationId: "group-1",
        createdAt: SENT_AT,
        deletedAt: null,
        deletedById: null,
        editedAt: null,
        expiresAt: args.expiresAt ?? null,
        forwardedAt: null,
        id: "message-1",
        placeholderRemovedAt: null,
        reactions: [],
        reply: null,
        replyToId: null,
        systemTargetUserIds: [],
        systemType: null,
        systemValue: null,
        threadParentId: null,
        userId: "member-1",
      },
    };
  }) as unknown as SendDirectMessageDependencies["createMessage"];
}

function dependencies(
  overrides: Partial<SendDirectMessageDependencies> = {},
): SendDirectMessageDependencies {
  return {
    createMessage: stubCreateMessage([]),
    findBlockedUserIds: async () => new Set<string>(),
    now: () => SENT_AT,
    loadAuthConversation: async () => conversationRow(),
    loadNotificationParticipants: async () => [
      {
        muted: false,
        notifyLevel: "ALL" as const,
        user: { displayName: "Member", id: "member-1", locale: "tr", username: "member" },
        userId: "member-1",
      },
      {
        muted: false,
        notifyLevel: "ALL" as const,
        user: { displayName: "Owner", id: "owner-1", locale: "tr", username: "owner" },
        userId: "owner-1",
      },
    ],
    ...overrides,
  };
}

function sendInput(overrides: Record<string, unknown> = {}) {
  return {
    content: "Merhaba",
    conversationId: "group-1",
    userId: "member-1",
    ...overrides,
  };
}

/**
 * §4.12 / §E. The `sendMessage` permission has to stop a write *inside the
 * service*, because the HTTP route and the socket handler both call this
 * function and a guard in either of them is a guard the other one skips.
 *
 * Every case here asserts the throw happens before any write: the dependency set
 * only covers the two reads that run in front of the gate, so a send that got
 * past it would fail on a missing database instead of the assertion — which is
 * itself the signal that the gate did not fire.
 */
describe("sendDirectMessage permission gate", () => {
  it("refuses a plain member once the group restricts sending to admins", async () => {
    await assert.rejects(
      sendDirectMessage(
        sendInput(),
        dependencies({
          loadAuthConversation: async () => conversationRow({ permSendMessage: "ADMINS" }),
        }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      },
    );
  });

  it("refuses somebody who is not in the conversation at all", async () => {
    await assert.rejects(
      sendDirectMessage(sendInput({ userId: "stranger-1" }), dependencies()),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("refuses a send into a conversation that no longer exists", async () => {
    await assert.rejects(
      sendDirectMessage(sendInput(), dependencies({ loadAuthConversation: async () => null })),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        return true;
      },
    );
  });

  it("checks the permission before it checks blocks", async () => {
    // Reaching the block read would mean the gate ran second, which is the
    // ordering the socket path cannot afford.
    let blockingReached = false;

    await assert.rejects(
      sendDirectMessage(
        sendInput(),
        dependencies({
          findBlockedUserIds: async () => {
            blockingReached = true;
            return new Set<string>();
          },
          loadAuthConversation: async () => conversationRow({ permSendMessage: "ADMINS" }),
        }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      },
    );

    assert.equal(blockingReached, false);
  });

  it("writes nothing at all when the gate refuses", async () => {
    const captured: Array<{ expiresAt?: Date | null }> = [];

    await assert.rejects(
      sendDirectMessage(
        sendInput(),
        dependencies({
          createMessage: stubCreateMessage(captured),
          loadAuthConversation: async () => conversationRow({ permSendMessage: "ADMINS" }),
        }),
      ),
    );

    assert.equal(captured.length, 0);
  });

  it("lets an admin send while the group is restricted", async () => {
    const captured: Array<{ expiresAt?: Date | null }> = [];

    const payload = await sendDirectMessage(
      sendInput({ userId: "owner-1" }),
      dependencies({
        createMessage: stubCreateMessage(captured),
        loadAuthConversation: async () =>
          conversationRow({
            participants: [
              {
                historyFromAt: null,
                joinedAt: JOINED_AT,
                notifyLevel: "ALL",
                pinnedStripDismissedId: null,
                role: "OWNER",
                userId: "owner-1",
              },
            ],
            permSendMessage: "ADMINS",
          }),
      }),
    );

    assert.equal(captured.length, 1);
    assert.equal(payload.id, "message-1");
  });

  it("allows a group message when one roster member has a block with the sender", async () => {
    const captured: Array<{ expiresAt?: Date | null }> = [];

    const payload = await sendDirectMessage(
      sendInput(),
      dependencies({
        createMessage: stubCreateMessage(captured),
        findBlockedUserIds: async () => {
          throw new Error("group sends must not query the roster-wide block gate");
        },
      }),
    );

    assert.equal(captured.length, 1);
    assert.equal(payload.id, "message-1");
  });

  it("still refuses a one-to-one message when either participant has blocked the other", async () => {
    const captured: Array<{ expiresAt?: Date | null }> = [];

    await assert.rejects(
      sendDirectMessage(
        sendInput(),
        dependencies({
          createMessage: stubCreateMessage(captured),
          findBlockedUserIds: async () => new Set(["owner-1"]),
          loadAuthConversation: async () => conversationRow({ type: "DM" }),
        }),
      ),
      (error: unknown) => error instanceof ApiError && error.code === "BLOCKED",
    );

    assert.equal(captured.length, 0);
  });
});

/**
 * K3 / C2. `sendDirectMessage` is the only path that creates a user message, so
 * it is the only place a disappearing deadline can be stamped. A message that
 * left here without one would never be swept.
 */
describe("disappearing message stamping", () => {
  async function captureSend(
    disappearingAfter: SendAuthConversationRow["disappearingAfter"],
  ): Promise<Array<{ expiresAt?: Date | null }>> {
    const captured: Array<{ expiresAt?: Date | null }> = [];

    await sendDirectMessage(
      sendInput(),
      dependencies({
        createMessage: stubCreateMessage(captured),
        loadAuthConversation: async () => conversationRow({ disappearingAfter }),
      }),
    );

    return captured;
  }

  it("writes no deadline while the window is off", async () => {
    const captured = await captureSend("OFF");

    assert.equal(captured[0]?.expiresAt, null);
  });

  it("stamps 24 hours ahead of the send instant", async () => {
    const captured = await captureSend("H24");

    assert.deepEqual(captured[0]?.expiresAt, new Date("2026-08-12T12:00:00.000Z"));
  });

  it("stamps 7 days ahead", async () => {
    const captured = await captureSend("D7");

    assert.deepEqual(captured[0]?.expiresAt, new Date("2026-08-18T12:00:00.000Z"));
  });

  it("stamps 90 days ahead", async () => {
    const captured = await captureSend("D90");

    assert.deepEqual(captured[0]?.expiresAt, new Date("2026-11-09T12:00:00.000Z"));
  });

  it("measures from the send clock, so a later window change cannot re-date it", async () => {
    // V6. The deadline belongs to the message; the only clock allowed to decide
    // it is the one it was written with.
    const captured: Array<{ expiresAt?: Date | null }> = [];

    await sendDirectMessage(
      sendInput(),
      dependencies({
        createMessage: stubCreateMessage(captured),
        loadAuthConversation: async () => conversationRow({ disappearingAfter: "H24" }),
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      }),
    );

    assert.deepEqual(captured[0]?.expiresAt, new Date("2026-01-02T00:00:00.000Z"));
  });

  it("does not stamp a message the permission gate refused", async () => {
    const captured: Array<{ expiresAt?: Date | null }> = [];

    await assert.rejects(
      sendDirectMessage(
        sendInput(),
        dependencies({
          createMessage: stubCreateMessage(captured),
          loadAuthConversation: async () =>
            conversationRow({ disappearingAfter: "H24", permSendMessage: "ADMINS" }),
        }),
      ),
    );

    assert.equal(captured.length, 0);
  });
});

/**
 * The behavioural tests above prove the service refuses. This one proves the
 * socket path has no way around the service: a `dm:message:send` handler that
 * wrote a message itself would be a second front door, and §4.12 says the guard
 * only holds while there is one.
 */
describe("socket send path", () => {
  it("routes dm:message:send through sendDirectMessage and writes nothing itself", async () => {
    const source = await readFile(new URL("../socket/handlers/dm.ts", import.meta.url), "utf8");
    const handler = source.slice(source.indexOf('socket.on("dm:message:send"'));
    const handlerBody = handler.slice(0, handler.indexOf('socket.on("dm:message:edit"'));

    assert.match(handlerBody, /await sendDirectMessage\(/);
    // No direct message creation, and no second permission decision.
    assert.equal(/prisma\.dMMessage\.create/.test(handlerBody), false);
    assert.equal(/createRealtimeDMMessage/.test(handlerBody), false);
  });
});

describe("resolveDMMentionedUserIds", () => {
  const roster = [
    { user: { username: "member" }, userId: "member-1" },
    { user: { username: "Owner" }, userId: "owner-1" },
  ];

  it("resolves a handle against the roster, case-insensitively", () => {
    assert.deepEqual(resolveDMMentionedUserIds("selam @owner", roster, "member-1"), ["owner-1"]);
    assert.deepEqual(resolveDMMentionedUserIds("selam @OWNER", roster, "member-1"), ["owner-1"]);
  });

  it("ignores a handle nobody in the conversation answers to", () => {
    assert.deepEqual(resolveDMMentionedUserIds("selam @nobody", roster, "member-1"), []);
  });

  it("never counts the sender mentioning themselves", () => {
    assert.deepEqual(resolveDMMentionedUserIds("@member not me", roster, "member-1"), []);
  });

  it("ignores the reserved mass mentions", () => {
    assert.deepEqual(resolveDMMentionedUserIds("@everyone @here", roster, "member-1"), []);
  });

  it("only matches a handle that starts a word", () => {
    assert.deepEqual(resolveDMMentionedUserIds("mail@owner.com", roster, "member-1"), []);
  });
});

describe("sendDirectMessage mentions", () => {
  type MentionCapture = {
    expiresAt?: Date | null;
    mentionedUserIds?: string[];
    notification?: { mentionedUserIds?: string[] };
  };

  it("hands the mentioned ids to the write and to the notification context", async () => {
    const captured: MentionCapture[] = [];

    await sendDirectMessage(
      sendInput({ content: "selam @owner" }),
      dependencies({ createMessage: stubCreateMessage(captured) }),
    );

    assert.deepEqual(captured[0]?.mentionedUserIds, ["owner-1"]);
    assert.deepEqual(captured[0]?.notification?.mentionedUserIds, ["owner-1"]);
  });

  it("sends an empty mention list for an ordinary message", async () => {
    const captured: MentionCapture[] = [];

    await sendDirectMessage(
      sendInput(),
      dependencies({ createMessage: stubCreateMessage(captured) }),
    );

    assert.deepEqual(captured[0]?.mentionedUserIds, []);
  });
});
