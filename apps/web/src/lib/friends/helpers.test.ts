import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMutualFriendsWhere } from "./helpers";

describe("friends helpers", () => {
  it("builds a bounded mutual-friend existence query", () => {
    assert.deepEqual(buildMutualFriendsWhere("user-a", "user-b"), {
      status: "ACCEPTED",
      OR: [
        {
          senderId: "user-a",
          receiver: {
            OR: [
              {
                friendRequestsSent: {
                  some: {
                    receiverId: "user-b",
                    status: "ACCEPTED",
                  },
                },
              },
              {
                friendRequestsReceived: {
                  some: {
                    senderId: "user-b",
                    status: "ACCEPTED",
                  },
                },
              },
            ],
          },
        },
        {
          receiverId: "user-a",
          sender: {
            OR: [
              {
                friendRequestsSent: {
                  some: {
                    receiverId: "user-b",
                    status: "ACCEPTED",
                  },
                },
              },
              {
                friendRequestsReceived: {
                  some: {
                    senderId: "user-b",
                    status: "ACCEPTED",
                  },
                },
              },
            ],
          },
        },
      ],
    });
  });
});
