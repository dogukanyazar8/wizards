import assert from "node:assert/strict";
import { it } from "node:test";
import {
  mobileAccountSettingsGetRoute,
  mobileAccountSettingsUpdateRoute,
  type MobileAccountSettingsRecord,
  type MobileAccountSettingsRouteDependencies,
} from "./route-logic";

const settings: MobileAccountSettingsRecord = {
  appearance: { messageCompact: false, messageFollowSystemFont: false, messageFontSize: "medium" },
  account: {
    bannerColor: null,
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
    bio: null,
    customStatus: null,
    customStatusEmoji: null,
    customStatusExpiresAt: null,
    email: "test@whispr.local",
    emailVerified: true,
    nextUsernameChangeAt: null,
    twoFactorEnabled: false,
  },
  privacy: {
    dmPermission: "FRIENDS",
    friendRequests: "EVERYONE",
    groupInvites: true,
    readReceipts: false,
  },
};
const dependencies: MobileAccountSettingsRouteDependencies = {
  authenticate: async () => "user-1",
  enforceRateLimit: async () => {},
  loadSettings: async () => settings,
  parseBody: async () => ({ readReceipts: false }),
  updateSettings: async () => settings,
};

for (const [method, handler] of [
  ["GET", mobileAccountSettingsGetRoute],
  ["PATCH", mobileAccountSettingsUpdateRoute],
] as const) {
  it(`${method} preserves the strict legacy privacy shape and negotiates read receipts`, async () => {
    const legacy = await handler(
      new Request("https://whispr.test/settings", { method }),
      dependencies,
    );
    assert.equal(legacy.status, 200);
    assert.equal("readReceipts" in (await legacy.json()).privacy, false);
    const current = await handler(
      new Request("https://whispr.test/settings", {
        method,
        headers: { "x-whispr-account-fields": "read-receipts" },
      }),
      dependencies,
    );
    assert.equal(current.status, 200);
    assert.equal((await current.json()).privacy.readReceipts, false);
  });
}
