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
  pronouns: null,
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
        bannerColor: currentUser.bannerColor,
        bannerOffsetX: currentUser.bannerOffsetX,
        bannerOffsetY: currentUser.bannerOffsetY,
        bannerUrl: currentUser.bannerUrl,
        bio: currentUser.bio,
        customStatus: currentUser.customStatus,
        customStatusEmoji: currentUser.customStatusEmoji,
        customStatusExpiresAt: currentUser.customStatusExpiresAt,
        displayName: "Ada",
        email: currentUser.email,
        pronouns: currentUser.pronouns,
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

  it("stamps the username change and blocks the next one for 30 days", async () => {
    const { getNextUsernameChangeAt, updateAccountProfile } = await service;
    const now = new Date("2026-07-23T12:00:00.000Z");
    let persisted: Record<string, unknown> | null = null;

    await updateAccountProfile(
      "user-1",
      { username: "ada" },
      dependencies({
        now: () => now,
        updateUser: async (_userId: string, input: Record<string, unknown>) => {
          persisted = input;
          return { ...currentUser, ...input };
        },
      }),
    );
    assert.equal((persisted as unknown as { usernameChangedAt: Date }).usernameChangedAt, now);

    const blockedUntil = getNextUsernameChangeAt(now, now);
    assert.equal(blockedUntil?.toISOString(), "2026-08-22T12:00:00.000Z");
    assert.equal(getNextUsernameChangeAt(now, new Date("2026-08-23T12:00:00.000Z")), null);
    assert.equal(getNextUsernameChangeAt(null, now), null);

    await assert.rejects(
      () =>
        updateAccountProfile(
          "user-1",
          { username: "ada_lovelace" },
          dependencies({
            findUser: async () => ({ ...currentUser, usernameChangedAt: now }),
            now: () => new Date("2026-07-30T12:00:00.000Z"),
            updateUser: async () => {
              throw new Error("must not run");
            },
          }),
        ),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 429 &&
        error.code === "USERNAME_CHANGE_COOLDOWN",
    );
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
  it("logs EMAIL_CHANGED only when the address actually moved", async () => {
    const { updateAccountProfile } = await service;
    const events: Array<Record<string, unknown>> = [];
    const recorder = {
      recordSecurityEvent: async (input: Record<string, unknown>) => {
        events.push(input);
      },
    };

    await updateAccountProfile("user-1", { displayName: "Ada" }, dependencies(recorder));
    assert.deepEqual(events, []);

    await updateAccountProfile("user-1", { email: "ada@example.com" }, dependencies(recorder));

    assert.deepEqual(events, [{ kind: "EMAIL_CHANGED", userId: "user-1" }]);
    // The row says the address moved; it does not carry the address itself.
    assert.equal(JSON.stringify(events).includes("ada@example.com"), false);
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
