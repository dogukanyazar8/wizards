import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { MobileApiClient } from "../api/mobile-api-client";
import { mobilePalette } from "../design/palette";
import { registerMobilePushToken } from "./mobile-notification-client";
import {
  createMobileNotificationRegistrationFailedState,
  createErroredMobileNotificationRuntimeState,
  createMobileNotificationRuntimeStateFromPermission,
  createRegisteredMobileNotificationRuntimeState,
  createUnavailableMobileNotificationRuntimeState,
  mapExpoNotificationPermissionStatus,
  shouldAttemptMobilePushRegistration,
  type MobileNotificationRuntimeState,
} from "./mobile-notification-contract";
import {
  MOBILE_PUSH_ANDROID_CHANNELS,
  MOBILE_PUSH_INCOMING_CALL_ACTIONS,
  MOBILE_PUSH_INCOMING_CALL_CATEGORY,
} from "./mobile-push-display-contract";

async function ensureNotificationChannelsAndCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    MOBILE_PUSH_INCOMING_CALL_CATEGORY,
    MOBILE_PUSH_INCOMING_CALL_ACTIONS.map((action) => ({
      buttonTitle: action.buttonTitle,
      identifier: action.identifier,
      options: { opensAppToForeground: action.opensAppToForeground },
    })),
  );

  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(MOBILE_PUSH_ANDROID_CHANNELS.default, {
    description: "Whispr message and server activity notifications.",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: mobilePalette.violet[600],
    name: "Whispr",
    vibrationPattern: [0, 160, 120, 160],
  });

  await Notifications.setNotificationChannelAsync(MOBILE_PUSH_ANDROID_CHANNELS.calls, {
    description: "Incoming voice and video call alerts.",
    importance: Notifications.AndroidImportance.MAX,
    lightColor: mobilePalette.violet[600],
    name: "Whispr Calls",
    vibrationPattern: [0, 400, 200, 400, 200, 400],
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

/**
 * Reads the operating-system permission without ever prompting, so the app can drop the
 * "allow notifications" prompt after the user granted it outside of the in-app button
 * (system settings, an earlier launch, or a failed token registration).
 */
export async function syncMobileNotificationPermissionState(
  client: MobileApiClient | null,
  current: MobileNotificationRuntimeState,
  now = Date.now(),
): Promise<MobileNotificationRuntimeState> {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    const permissionStatus = mapExpoNotificationPermissionStatus(
      permissions.status,
      permissions.canAskAgain,
    );

    if (permissionStatus !== "granted") {
      return createMobileNotificationRuntimeStateFromPermission(permissionStatus, now);
    }

    await ensureNotificationChannelsAndCategories();

    if (client && shouldAttemptMobilePushRegistration(current, now)) {
      return registerGrantedNotificationPermission(client, now);
    }

    if (current.hasLocalPermission) {
      return current;
    }

    return createMobileNotificationRuntimeStateFromPermission(permissionStatus, now);
  } catch {
    // A background sync must never replace a usable state with an error card.
    return current;
  }
}

export async function requestMobileNotificationsAfterUserAction(
  client: MobileApiClient,
  now = Date.now(),
): Promise<MobileNotificationRuntimeState> {
  try {
    await ensureNotificationChannelsAndCategories();

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
