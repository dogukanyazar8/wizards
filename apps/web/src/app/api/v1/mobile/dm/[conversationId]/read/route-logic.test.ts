import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import { mobileDMMarkReadRoute } from "./route-logic";

describe("mobile DM mark-read route", () => {
  it("authenticates, rate-limits, marks read, returns authoritative states, and emits the receipt", async () => {
    const calls: string[] = [];
    const response = await mobileDMMarkReadRoute(
      new Request("https://example.test/api/v1/mobile/dm/conversation-1/read", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ conversationId: "conversation-1" }) },
      {
        authenticate: async () => {
          calls.push("authenticate");
          return "user-1";
        },
        canPublishReadReceipt: async () => true,
        enforceRateLimit: async (userId, action) => {
          calls.push(`rate-limit:${userId}:${action}`);
        },
        getParticipantReadStates: async () => {
          calls.push("read-states");
          return [
            {
              lastDeliveredAt: new Date("2026-07-17T08:04:00.000Z"),
              lastReadAt: new Date("2026-07-17T08:05:00.000Z"),
              userId: "user-1",
            },
            { lastDeliveredAt: null, lastReadAt: null, userId: "user-2" },
          ];
        },
        markRead: async () => {
          calls.push("mark-read");
        },
        emitReadUpdate: (event, participantUserIds) => {
          calls.push(
            `emit:${event.conversationId}:${event.userId}:${event.lastReadAt}:${participantUserIds.join(",")}`,
          );
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      conversationId: "conversation-1",
      participantReadStates: [
        {
          lastDeliveredAt: "2026-07-17T08:04:00.000Z",
          lastReadAt: "2026-07-17T08:05:00.000Z",
          userId: "user-1",
        },
        { lastDeliveredAt: null, lastReadAt: null, userId: "user-2" },
      ],
    });
    // §2 "1a".6.4: every participant is a fan-out target, because the sender
    // waiting for the third tick is sitting on the conversation list, not in
    // the `dm:<id>` room.
    assert.deepEqual(calls, [
      "authenticate",
      "rate-limit:user-1:mobile:dm:mark-read",
      "mark-read",
      "read-states",
      "emit:conversation-1:user-1:2026-07-17T08:05:00.000Z:user-1,user-2",
    ]);
  });

  // §15.5 madde 2. The switch is enforced on the publishing side: the reader
  // still gets its own authoritative states back, but nothing leaves the server.
  it("marks read without emitting when the reader turned read receipts off", async () => {
    let emitted = false;
    const response = await mobileDMMarkReadRoute(
      new Request("https://example.test/api/v1/mobile/dm/conversation-1/read", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ conversationId: "conversation-1" }) },
      {
        authenticate: async () => "user-1",
        canPublishReadReceipt: async () => false,
        enforceRateLimit: async () => undefined,
        getParticipantReadStates: async () => [
          {
            lastDeliveredAt: new Date("2026-07-17T08:04:00.000Z"),
            lastReadAt: new Date("2026-07-17T08:05:00.000Z"),
            userId: "user-1",
          },
          { lastDeliveredAt: null, lastReadAt: null, userId: "user-2" },
        ],
        markRead: async () => undefined,
        emitReadUpdate: () => {
          emitted = true;
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(emitted, false);
    assert.deepEqual(await response.json(), {
      conversationId: "conversation-1",
      participantReadStates: [
        {
          lastDeliveredAt: "2026-07-17T08:04:00.000Z",
          lastReadAt: "2026-07-17T08:05:00.000Z",
          userId: "user-1",
        },
        { lastDeliveredAt: null, lastReadAt: null, userId: "user-2" },
      ],
    });
  });

  it("does not mutate or emit when authentication fails", async () => {
    let mutated = false;
    const response = await mobileDMMarkReadRoute(
      new Request("https://example.test/api/v1/mobile/dm/conversation-1/read", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ conversationId: "conversation-1" }) },
      {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        canPublishReadReceipt: async () => true,
        enforceRateLimit: async () => undefined,
        getParticipantReadStates: async () => [],
        markRead: async () => {
          mutated = true;
        },
        emitReadUpdate: () => {
          mutated = true;
        },
      },
    );

    assert.equal(response.status, 401);
    assert.equal(mutated, false);
  });
});
