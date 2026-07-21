import * as Notifications from "expo-notifications";

import {
  parseMobilePushData,
  resolveMobilePushNavigationPath,
  shouldPresentMobilePushInForeground,
} from "./mobile-push-display-contract";

// Cold-start replay must happen once per JS process, even if the runtime
// remounts, or a stale tap would re-navigate on every provider remount.
let hasReplayedInitialResponse = false;

export interface MobilePushResponseRuntimeOptions {
  /** Best-effort decline relay; no-op when the socket is down. */
  readonly declineDMCall: (conversationId: string, fromUserId: string) => void;
  /** Navigates using an app path such as "/channels/@me/<conversationId>". */
  readonly navigateToPath: (path: string) => void;
}

function routeNotificationResponse(
  response: Notifications.NotificationResponse,
  options: MobilePushResponseRuntimeOptions,
): void {
  const data = parseMobilePushData(response.notification.request.content.data);
  if (!data) {
    return;
  }

  if (data.kind === "dm-call" && response.actionIdentifier === "decline") {
    options.declineDMCall(data.conversationId, data.fromUserId);
    void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(
      () => undefined,
    );
    return;
  }

  // Default tap and the "answer" action both open the relevant screen.
  options.navigateToPath(resolveMobilePushNavigationPath(data));
}

/**
 * Wires the process-wide expo-notifications hooks: foreground presentation
 * policy (feed silent, calls ring), tap/action routing into navigation, and the
 * Decline action side effect. Returns a cleanup function; mount exactly once.
 */
export function startMobilePushResponseRuntime(
  options: MobilePushResponseRuntimeOptions,
): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = parseMobilePushData(notification.request.content.data);
      const present = shouldPresentMobilePushInForeground(data);
      return {
        shouldPlaySound: present,
        shouldSetBadge: false,
        shouldShowBanner: present,
        shouldShowList: present,
      };
    },
  });

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      routeNotificationResponse(response, options);
    },
  );

  // Cold start: the app process may have been launched by a notification tap
  // before this runtime mounted; replay that response once.
  if (!hasReplayedInitialResponse) {
    hasReplayedInitialResponse = true;
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          routeNotificationResponse(response, options);
        }
      })
      .catch(() => undefined);
  }

  return () => {
    responseSubscription.remove();
  };
}
