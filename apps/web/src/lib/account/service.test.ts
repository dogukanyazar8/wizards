import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { FriendPresenceStatus } from "@/lib/friends/types";

const service = import("./service");

const currentUser = {
  avatarUrl: null,
  customStatus: null,
  displayName: "Old Name",
  email: "dogukan@example.com",
  emailVerified: true,
  id: "user-1",
  status: "ONLINE" as const,
  twoFactorEnabled: false,
  username: "dogukan",
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    broadcastPresence: async () => undefined,
    broadcastProfile: async () => undefined,
    findEmailConflict: async () => false,
    findUser: async () => currentUser,
    findUsernameConflict: async () => false,
    persistPresence: async (_userId: string, status: FriendPresenceStatus) => ({
      customStatus: null,
      status,
      userId: "user-1",
    }),
    updateUser: async (_userId: string, input: Record<string, unknown>) => ({
      ...currentUser,
      ...input,
    }),
    ...overrides,
  };
}

describe("account service", () => {
  it("updates only supplied profile fields and broadcasts the normalized profile", async () => {
    const { updateAccountProfile } = await service;
    const calls: unknown[] = [];
    const result = await updateAccountProfile(
      "user-1",
      { displayName: "  Ada  " },
      dependencies({
        broadcastPresence: async (presence: unknown) => calls.push(["presence", presence]),
        broadcastProfile: async (profile: unknown) => calls.push(["profile", profile]),
        updateUser: async (userId: string, input: Record<string, unknown>) => {
          calls.push(["update", userId, input]);
          return { ...currentUser, ...input };
        },
      }),
    );

    assert.equal(result.displayName, "Ada");
    assert.deepEqual(calls[0], [
      "update",
      "user-1",
      {
        displayName: "Ada",
        email: currentUser.email,
        status: currentUser.status,
        username: currentUser.username,
      },
    ]);
    assert.deepEqual(calls[2], [
      "profile",
      {
        avatarUrl: null,
        customStatus: null,
        displayName: "Ada",
        status: "ONLINE",
        userId: "user-1",
        username: "dogukan",
      },
    ]);
  });

  it("fails with stable conflict codes before persistence", async () => {
    const { updateAccountProfile } = await service;
    let updates = 0;
    await assert.rejects(
      () =>
        updateAccountProfile(
          "user-1",
          { username: "ada" },
          dependencies({
            findUsernameConflict: async () => true,
            updateUser: async () => {
              updates += 1;
              return currentUser;
            },
          }),
        ),
      (error) =>
        error instanceof ApiError && error.status === 409 && error.code === "USERNAME_TAKEN",
    );
    assert.equal(updates, 0);
  });

  it("persists and broadcasts only whitelisted presence values", async () => {
    const { updateAccountPresence } = await service;
    const calls: unknown[] = [];
    const result = await updateAccountPresence(
      "user-1",
      "DND",
      dependencies({
        broadcastPresence: async (presence: unknown) => calls.push(presence),
      }),
    );

    assert.equal(result.status, "DND");
    assert.deepEqual(calls, [{ customStatus: null, status: "DND", userId: "user-1" }]);
  });

  it("fails closed when account or presence persistence is unavailable", async () => {
    const { updateAccountPresence, updateAccountProfile } = await service;
    await assert.rejects(
      () => updateAccountProfile("missing", { displayName: "Ada" }, dependencies({ findUser: async () => null })),
      (error) => error instanceof ApiError && error.status === 404 && error.code === "USER_NOT_FOUND",
    );
    await assert.rejects(
      () => updateAccountPresence("user-1", "ONLINE", dependencies({ persistPresence: async () => null })),
      (error) => error instanceof ApiError && error.status === 503 && error.code === "PRESENCE_UNAVAILABLE",
    );
  });
});
