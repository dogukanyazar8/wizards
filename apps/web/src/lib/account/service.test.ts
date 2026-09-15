import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { FriendPresenceStatus } from "@/lib/friends/types";

const service = import("./service");

const currentUser = {
  avatarUrl: null,
  bannerColor: null,
  bannerOffsetX: null,
  bannerOffsetY: null,
  bannerUrl: null,
  bio: null,
  customStatus: null,
  customStatusEmoji: null,
  customStatusExpiresAt: null,
  usernameChangedAt: null,
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
    ownsBannerUpload: async () => true,
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
  it("rejects email changes through the profile path before any write", async () => {
    const { updateAccountProfile } = await service;
    let writes = 0;
    await assert.rejects(
      updateAccountProfile(
        "user-1",
        { email: "new@example.com" },
        dependencies({
          updateUser: async () => {
            writes += 1;
            return currentUser;
          },
        }),
      ),
      (error: unknown) => error instanceof ApiError && error.code === "EMAIL_CHANGE_REQUIRED",
    );
    assert.equal(writes, 0);
  });
  it("clears the status trio in one write without rewriting the rest of the profile", async () => {
    const { updateAccountProfile } = await service;
    let saved: Record<string, unknown> | undefined;
    let refreshed = 0;
    await updateAccountProfile(
      "user-1",
      { customStatus: "  " },
      dependencies({
        findUser: async () => ({
          ...currentUser,
          customStatus: "Release",
          customStatusEmoji: "🚀",
          customStatusExpiresAt: new Date("2099-01-01"),
        }),
        updateUser: async (_id: string, patch: Record<string, unknown>) => {
          saved = patch;
          return { ...currentUser, ...patch };
        },
        refreshPresence: async () => {
          refreshed += 1;
        },
      }),
    );
    assert.deepEqual(saved, {
      customStatus: null,
      customStatusEmoji: null,
      customStatusExpiresAt: null,
    });
    assert.equal(refreshed, 1);
  });

  it("rejects oversized biographies before persistence", async () => {
    const { updateAccountProfile } = await service;
    await assert.rejects(
      updateAccountProfile(
        "user-1",
        { bio: "x".repeat(251) },
        dependencies({
          updateUser: async () => {
            throw new Error("must not write");
          },
        }),
      ),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 400 &&
        error.code === "INVALID_PROFILE_DETAILS",
    );
  });
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
      },
    ]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], [
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

  it("allows consecutive valid username and display name changes without a cooldown", async () => {
    const { updateAccountProfile } = await service;
    const now = new Date("2026-09-11T12:00:00.000Z");
    let stored = { ...currentUser, usernameChangedAt: null as Date | null };
    const deps = dependencies({
      now: () => now,
      findUser: async () => stored,
      updateUser: async (_userId: string, input: Record<string, unknown>) => {
        stored = { ...stored, ...input };
        return stored;
      },
    });
    await updateAccountProfile("user-1", { username: "ada", displayName: "Ada" }, deps);
    await updateAccountProfile(
      "user-1",
      { username: "ada_lovelace", displayName: "Ada Lovelace" },
      deps,
    );
    assert.equal(stored.username, "ada_lovelace");
    assert.equal(stored.displayName, "Ada Lovelace");
    assert.equal(stored.usernameChangedAt, now);
  });

  it("takes a banner only from an upload this account owns", async () => {
    const { updateAccountProfile } = await service;
    const checked: string[] = [];

    await assert.rejects(
      () =>
        updateAccountProfile(
          "user-1",
          { bannerUrl: "https://attacker.example/track.png" },
          dependencies({
            ownsBannerUpload: async (_userId: string, url: string) => {
              checked.push(url);
              return false;
            },
            updateUser: async () => {
              throw new Error("must not run");
            },
          }),
        ),
      (error) =>
        error instanceof ApiError && error.status === 400 && error.code === "BANNER_NOT_OWNED",
    );
    assert.deepEqual(checked, ["https://attacker.example/track.png"]);

    const saved = await updateAccountProfile(
      "user-1",
      { bannerUrl: "https://cdn.whispr.test/banner.png" },
      dependencies(),
    );
    assert.equal(saved.bannerUrl, "https://cdn.whispr.test/banner.png");

    // Clearing the banner touches no upload row, so it never has to own one.
    const cleared = await updateAccountProfile(
      "user-1",
      { bannerUrl: null },
      dependencies({
        ownsBannerUpload: async () => {
          throw new Error("must not run");
        },
      }),
    );
    assert.equal(cleared.bannerUrl, null);
  });

  it("hides a custom status whose deadline has passed", async () => {
    const { resolveVisibleCustomStatus } = await service;
    const now = new Date("2026-07-23T12:00:00.000Z");

    assert.deepEqual(
      resolveVisibleCustomStatus(
        {
          customStatus: "Release",
          customStatusEmoji: "🎧",
          customStatusExpiresAt: new Date("2026-07-23T11:00:00.000Z"),
        },
        now,
      ),
      { customStatus: null, customStatusEmoji: null, customStatusExpiresAt: null },
    );
    assert.deepEqual(
      resolveVisibleCustomStatus(
        {
          customStatus: "Release",
          customStatusEmoji: "🎧",
          customStatusExpiresAt: new Date("2026-07-23T16:00:00.000Z"),
        },
        now,
      ),
      {
        customStatus: "Release",
        customStatusEmoji: "🎧",
        customStatusExpiresAt: "2026-07-23T16:00:00.000Z",
      },
    );
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

  it("fans out the invisible choice as a plain offline presence", async () => {
    const { mapVisiblePresenceStatus, updateAccountPresence } = await service;
    const broadcasts: unknown[] = [];

    // "Görünmez" is written as OFFLINE — the contract has no INVISIBLE — so the
    // fanout must carry OFFLINE and nothing that hints the account is live.
    const result = await updateAccountPresence(
      "user-1",
      "OFFLINE",
      dependencies({
        broadcastPresence: async (presence: unknown) => broadcasts.push(presence),
      }),
    );

    assert.equal(result.status, "OFFLINE");
    assert.deepEqual(broadcasts, [{ customStatus: null, status: "OFFLINE", userId: "user-1" }]);
    // A row still holding the legacy INVISIBLE value publishes the same way.
    assert.equal(mapVisiblePresenceStatus("INVISIBLE"), "OFFLINE");
  });

  it("fails closed when account or presence persistence is unavailable", async () => {
    const { updateAccountPresence, updateAccountProfile } = await service;
    await assert.rejects(
      () =>
        updateAccountProfile(
          "missing",
          { displayName: "Ada" },
          dependencies({ findUser: async () => null }),
        ),
      (error) =>
        error instanceof ApiError && error.status === 404 && error.code === "USER_NOT_FOUND",
    );
    await assert.rejects(
      () =>
        updateAccountPresence(
          "user-1",
          "ONLINE",
          dependencies({ persistPresence: async () => null }),
        ),
      (error) =>
        error instanceof ApiError && error.status === 503 && error.code === "PRESENCE_UNAVAILABLE",
    );
  });
  it("never rewrites an email from a stale profile payload", async () => {
    const { updateAccountProfile } = await service;
    let saved: Record<string, unknown> = {};
    await updateAccountProfile(
      "user-1",
      { email: currentUser.email, displayName: "Ada" },
      dependencies({
        updateUser: async (_id: string, patch: Record<string, unknown>) => {
          saved = patch;
          return { ...currentUser, ...patch };
        },
      }),
    );
    assert.equal(Object.hasOwn(saved, "email"), false);
    assert.equal(saved.displayName, "Ada");
  });

  it("masks a stored phone number and never returns the raw digits", async () => {
    const { getAccountSettingsRows, maskPhoneNumber } = await service;

    assert.equal(maskPhoneNumber("+905321234218"), "+905•••••4218");
    assert.equal(maskPhoneNumber(null), null);
    assert.equal(maskPhoneNumber("   "), null);

    const rows = await getAccountSettingsRows("user-1", {
      findLastPasswordChange: async () => new Date("2026-08-20T09:00:00.000Z"),
      findLastVerificationEmail: async () => new Date("2026-08-22T09:00:00.000Z"),
      findUser: async () => ({
        email: "dogukan@example.com",
        emailVerified: true,
        phoneNumber: "+905321234218",
        phoneVerified: false,
      }),
    });

    assert.deepEqual(rows, {
      email: "dogukan@example.com",
      emailVerified: true,
      passwordChangedAt: "2026-08-20T09:00:00.000Z",
      phone: "+905•••••4218",
      phoneVerified: false,
      verificationEmailSentAt: "2026-08-22T09:00:00.000Z",
    });
    assert.equal(JSON.stringify(rows).includes("5321234218"), false);
  });

  it("reports a never-verified, never-changed account with nulls rather than zeros", async () => {
    const { getAccountSettingsRows } = await service;

    const rows = await getAccountSettingsRows("user-1", {
      findLastPasswordChange: async () => null,
      findLastVerificationEmail: async () => null,
      findUser: async () => ({
        email: "dogukan@example.com",
        emailVerified: false,
        phoneNumber: null,
        phoneVerified: false,
      }),
    });

    assert.equal(rows.passwordChangedAt, null);
    assert.equal(rows.verificationEmailSentAt, null);
    assert.equal(rows.phone, null);
  });

  it("refuses account rows for a missing user", async () => {
    const { getAccountSettingsRows } = await service;

    await assert.rejects(
      () =>
        getAccountSettingsRows("ghost", {
          findLastPasswordChange: async () => null,
          findLastVerificationEmail: async () => null,
          findUser: async () => null,
        }),
      (error: unknown) => error instanceof ApiError && error.status === 404,
    );
  });
});
