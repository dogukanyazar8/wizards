import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { MobileApiClient } from "../api/mobile-api-client";
import { registerMobilePushToken } from "./mobile-notification-client";
import {
  createMobileNotificationRegistrationFailedState,
  createErroredMobileNotificationRuntimeState,
  createMobileNotificationRuntimeStateFromPermission,
  createRegisteredMobileNotificationRuntimeState,
  createUnavailableMobileNotificationRuntimeState,
  mapExpoNotificationPermissionStatus,
  type MobileNotificationRuntimeState,
} from "./mobile-notification-contract";

const WHISPR_DEFAULT_NOTIFICATION_CHANNEL_ID = "whispr-default";

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(WHISPR_DEFAULT_NOTIFICATION_CHANNEL_ID, {
    description: "Whispr message and server activity notifications.",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#7C3AED",
    name: "Whispr",
    vibrationPattern: [0, 160, 120, 160],
  });
}

function getMobilePushPlatform() {
  if (Platform.OS === "android" || Platform.OS === "ios") {
    return Platform.OS;
  }

  return null;
}

async function registerGrantedNotificationPermission(
  client: MobileApiClient,
  now: number,
): Promise<MobileNotificationRuntimeState> {
  const platform = getMobilePushPlatform();
  if (!platform) {
    return createUnavailableMobileNotificationRuntimeState(
      "Push notification tokens are only available on Android and iOS builds.",
      now,
    );
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const registration = await registerMobilePushToken(client, {
      platform,
      provider: "expo",
      token: tokenResponse.data,
    });

    return createRegisteredMobileNotificationRuntimeState(
      {
        registeredAt: registration.registeredAt,
        tokenFingerprint: registration.tokenFingerprint,
      },
      now,
    );
  } catch (error) {
    return createMobileNotificationRegistrationFailedState(error, now);
  }
}

export async function requestMobileNotificationsAfterUserAction(
  client: MobileApiClient,
  now = Date.now(),
): Promise<MobileNotificationRuntimeState> {
  try {
    await ensureAndroidNotificationChannel();

    const currentPermissions = await Notifications.getPermissionsAsync();
    const currentStatus = mapExpoNotificationPermissionStatus(
      currentPermissions.status,
      currentPermissions.canAskAgain,
    );

    if (currentStatus === "granted" || currentStatus === "blocked") {
      if (currentStatus === "granted") {
        return registerGrantedNotificationPermission(client, now);
      }

      return createMobileNotificationRuntimeStateFromPermission(currentStatus, now);
    }

    const requestedPermissions = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    const requestedStatus = mapExpoNotificationPermissionStatus(
      requestedPermissions.status,
      requestedPermissions.canAskAgain,
    );

    if (requestedStatus === "granted") {
      return registerGrantedNotificationPermission(client, now);
    }

    return createMobileNotificationRuntimeStateFromPermission(requestedStatus, now);
  } catch (error) {
    const message =
      error instanceof Error && /native module|not available|unavailable/i.test(error.message)
        ? error.message
        : null;

    if (message) {
      return createUnavailableMobileNotificationRuntimeState(message, now);
    }

    return createErroredMobileNotificationRuntimeState(error, now);
  }
}
