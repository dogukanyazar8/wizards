import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { assertUnblockedDMParticipants } from "@/lib/dm/blocking";

import type { HandlerContext } from "../context";
import { registerDMHandlers } from "./dm";

function createHandlerContextRecorder() {
  const events: string[] = [];
  const socket = {
    data: {
      displayName: "Ada",
      userId: "user-1",
      username: "ada",
    },
    on(event: string) {
      events.push(event);
      return socket;
    },
  };

  const ctx = {
    io: {},
    redis: {},
    socket,
    userId: "user-1",
  } as unknown as HandlerContext;

  return { ctx, events };
}

describe("socket DM handlers", () => {
  it("registers all DM socket events", () => {
    const { ctx, events } = createHandlerContextRecorder();

    registerDMHandlers(ctx);

    assert.deepEqual(events, [
      "dm:join",
      "dm:leave",
      "dm:screenshare:start",
      "dm:screenshare:accept",
      "dm:screenshare:decline",
      "dm:screenshare:stop",
      "dm:message:send",
      "dm:message:edit",
      "dm:message:delete",
      "dm:message:react",
      "dm:message:unreact",
    ]);
  });

  it("checks every other participant before allowing group DM messages", async () => {
    const checkedCandidateUserIds: string[][] = [];

    await assert.rejects(
      assertUnblockedDMParticipants({
        currentUserId: "user-1",
        findBlockedUserIdsForUser: async (currentUserId, candidateUserIds) => {
          assert.equal(currentUserId, "user-1");
          checkedCandidateUserIds.push([...candidateUserIds]);
          return new Set(["user-3"]);
        },
        participants: [{ userId: "user-1" }, { userId: "user-2" }, { userId: "user-3" }],
      }),
      (error) => error instanceof ApiError && error.code === "BLOCKED" && error.status === 403,
    );

    assert.deepEqual(checkedCandidateUserIds, [["user-2", "user-3"]]);
  });

  it("rejects group DM messages when the blocked participant is at index 1", async () => {
    const checkedCandidateUserIds: string[][] = [];

    await assert.rejects(
      assertUnblockedDMParticipants({
        currentUserId: "user-1",
        findBlockedUserIdsForUser: async (_currentUserId, candidateUserIds) => {
          checkedCandidateUserIds.push([...candidateUserIds]);
          return new Set(["user-3"]);
        },
        participants: [{ userId: "user-2" }, { userId: "user-3" }, { userId: "user-1" }],
      }),
      (error) => error instanceof ApiError && error.code === "BLOCKED" && error.status === 403,
    );

    assert.deepEqual(checkedCandidateUserIds, [["user-2", "user-3"]]);
  });
});
