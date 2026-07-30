import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-application", () => ({
  applicationId: "com.whispr.uat.test",
  getIosPushNotificationServiceEnvironmentAsync: jest.fn(async () => "production"),
}));

jest.mock("expo-notifications/build/ServerRegistrationModule", () => ({
  __esModule: true,
  default: {
    getInstallationIdAsync: jest.fn(async () => "test-installation-id"),
  },
}));

import { updateDevicePushTokenAsync } from "expo-notifications/build/utils/updateDevicePushTokenAsync";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("expo-notifications device token cancellation", () => {
  it("does not warn when the active request was intentionally cancelled", async () => {
    const controller = new AbortController();
    const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    globalThis.fetch = jest.fn(async () => {
      controller.abort();
      throw new Error("fetch failed: Fetch request has been canceled");
    }) as typeof fetch;

    await updateDevicePushTokenAsync(controller.signal, {
      data: "test-fcm-token",
      type: "android",
    });

    expect(warning).not.toHaveBeenCalled();
  });

  it("still warns for a real network failure", async () => {
    const controller = new AbortController();
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {
      controller.abort();
    });
    const networkError = new Error("network unavailable");

    globalThis.fetch = jest.fn(async () => {
      throw networkError;
    }) as typeof fetch;

    await updateDevicePushTokenAsync(controller.signal, {
      data: "test-fcm-token",
      type: "android",
    });

    expect(warning).toHaveBeenCalledWith(
      "[expo-notifications] Error thrown while updating the device push token with the server:",
      networkError,
    );
  });
});
