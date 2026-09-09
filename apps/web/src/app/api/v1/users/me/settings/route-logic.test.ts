import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";

import {
  settingsGetRoute,
  settingsPatchRoute,
  type NotificationSettingsRecord,
  type SettingsPersistenceRecord,
  type SettingsRouteDependencies,
} from "./route-logic";

const baseNotifications = {
  desktopNotifications: true,
  emailNotifications: false,
  mobileNotifications: true,
  notificationSound: true,
  notificationSoundFile: "default",
} satisfies NotificationSettingsRecord;

const baseRecord: SettingsPersistenceRecord = {
  notificationSettings: baseNotifications,
  settings: {
    allowGroupInvites: true,
    channelSidebarWidth: 288,
    dateFormat: "LOCALE",
    dmPolicy: "FRIENDS",
    friendRequestPolicy: "EVERYONE",
    idleTimeoutMinutes: 15,
    interfaceDensity: "COMFORTABLE",
    // F2 — Görünüm bölümünün sunucuya taşınan kalanı.
    animateEmoji: true,
    animateStickers: "INTERACTION",
    appIcon: "whispr",
    enableTTS: true,
    followSystemA11y: true,
    highContrast: false,
    inlineAttachmentMedia: true,
    linkPreviews: true,
    mainContentWidth: 100,
    messageDisplayCompact: false,
    messageSizePx: 15,
    reduceMotion: false,
    renderEmbeds: true,
    renderReactions: true,
    screenReaderDescriptions: true,
    serverIconSize: 44,
    showMemberPanelByDefault: true,
    strongFocusRings: true,
    uiTextScale: 100,
    messageFont: "outfit",
    notificationAutoClose: true,
    notificationLimit: 5,
    presenceVisibility: "EVERYONE",
    profileVisibility: "EVERYONE",
    serverRailWidth: 136,
    timeFormat: "LOCALE",
    timeZone: null,
  },
};

function request(body: unknown) {
  return new Request("http://localhost/api/v1/users/me/settings", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

function dependencies(
  overrides: Partial<SettingsRouteDependencies> = {},
): SettingsRouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    loadSettings: async () => baseRecord,
    updateSettings: async (_userId, layoutData, notificationData) => ({
      notificationSettings: { ...baseNotifications, ...notificationData },
      settings: { ...baseRecord.settings, ...layoutData },
    }),
    ...overrides,
  };
}

describe("web user settings route", () => {
  it("maps nullable database timezone to the public AUTO preference", async () => {
    const response = await settingsGetRoute(dependencies());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ...baseRecord.notificationSettings,
      ...baseRecord.settings,
      timeZone: "AUTO",
    });
  });

  it("canonicalizes an IANA timezone and preserves omitted settings", async () => {
    let capturedLayout: Record<string, unknown> | undefined;
    const response = await settingsPatchRoute(
      request({ profileVisibility: "FRIENDS", timeZone: " Europe/Istanbul " }),
      dependencies({
        updateSettings: async (_userId, layoutData, notificationData) => {
          capturedLayout = layoutData;
          return {
            notificationSettings: { ...baseNotifications, ...notificationData },
            settings: { ...baseRecord.settings, ...layoutData },
          };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(capturedLayout, {
      profileVisibility: "FRIENDS",
      timeZone: "Europe/Istanbul",
    });
    assert.equal((await response.json()).friendRequestPolicy, "EVERYONE");
  });

  it("stores AUTO as null and serializes it back as AUTO", async () => {
    let capturedLayout: Record<string, unknown> | undefined;
    const response = await settingsPatchRoute(
      request({ timeZone: "AUTO" }),
      dependencies({
        updateSettings: async (_userId, layoutData, notificationData) => {
          capturedLayout = layoutData;
          return {
            notificationSettings: { ...baseNotifications, ...notificationData },
            settings: { ...baseRecord.settings, ...layoutData },
          };
        },
      }),
    );

    assert.deepEqual(capturedLayout, { timeZone: null });
    assert.equal((await response.json()).timeZone, "AUTO");
  });

  it("rejects an invalid IANA timezone without writing", async () => {
    let writes = 0;
    const response = await settingsPatchRoute(
      request({ timeZone: "Mars/Olympus_Mons" }),
      dependencies({
        updateSettings: async () => {
          writes += 1;
          return baseRecord;
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(writes, 0);
  });

  it("preserves existing layout and notification patch behavior", async () => {
    let capturedLayout: Record<string, unknown> | undefined;
    let capturedNotifications: Record<string, unknown> | undefined;
    const response = await settingsPatchRoute(
      request({ desktopNotifications: false, dmPolicy: "NOBODY", notificationLimit: 3 }),
      dependencies({
        updateSettings: async (_userId, layoutData, notificationData) => {
          capturedLayout = layoutData;
          capturedNotifications = notificationData;
          return {
            notificationSettings: { ...baseNotifications, ...notificationData },
            settings: { ...baseRecord.settings, ...layoutData },
          };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(capturedLayout, { dmPolicy: "NOBODY", notificationLimit: 3 });
    assert.deepEqual(capturedNotifications, { desktopNotifications: false });
  });

  it("rebroadcasts canonical presence only after a presence visibility write succeeds", async () => {
    const broadcasts: string[] = [];
    const response = await settingsPatchRoute(
      request({ presenceVisibility: "FRIENDS" }),
      dependencies({
        onPresenceVisibilityChanged: async (userId: string) => {
          broadcasts.push(userId);
        },
      } as Partial<SettingsRouteDependencies> & {
        onPresenceVisibilityChanged(userId: string): Promise<void>;
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(broadcasts, ["user-1"]);
  });

  it("does not write when authentication or rate limiting fails", async () => {
    let writes = 0;
    const unauthorized = await settingsPatchRoute(
      request({ dateFormat: "DMY" }),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        updateSettings: async () => {
          writes += 1;
          return baseRecord;
        },
      }),
    );
    const rateLimited = await settingsPatchRoute(
      request({ dateFormat: "DMY" }),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
        updateSettings: async () => {
          writes += 1;
          return baseRecord;
        },
      }),
    );

    assert.equal(unauthorized.status, 401);
    assert.equal(rateLimited.status, 429);
    assert.equal(writes, 0);
  });
});
