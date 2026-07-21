import { useEffect } from "react";
import { resolveMobileRoutePathIntent } from "../../navigation/mobile-linking";
import { navigateMobileRouteIntent } from "../../navigation/mobile-navigation-ref";
import { startMobilePushResponseRuntime } from "../../notifications/mobile-push-response-runtime";
import { useMobileRealtimeRuntime } from "./mobile-realtime-provider";

const NAVIGATION_RETRY_DELAY_MS = 500;
const NAVIGATION_RETRY_LIMIT = 5;

function navigatePushPathWhenReady(path: string, attempt = 0): void {
  const intent = resolveMobileRoutePathIntent(path);
  if (!intent) {
    return;
  }

  if (navigateMobileRouteIntent(intent)) {
    return;
  }

  // Cold starts can deliver the tap before the navigation container mounts.
  if (attempt < NAVIGATION_RETRY_LIMIT) {
    setTimeout(() => navigatePushPathWhenReady(path, attempt + 1), NAVIGATION_RETRY_DELAY_MS);
  }
}

/**
 * Mounts the push response runtime once. Lives inside MobileRealtimeProvider so
 * the Decline action can relay over the live socket; navigation goes through
 * the shared navigation ref.
 */
export function MobilePushResponseBridge() {
  const { emitDMCallDecline } = useMobileRealtimeRuntime();

  useEffect(
    () =>
      startMobilePushResponseRuntime({
        declineDMCall: (conversationId, fromUserId) => {
          emitDMCallDecline({ conversationId, fromUserId });
        },
        navigateToPath: navigatePushPathWhenReady,
      }),
    [emitDMCallDecline],
  );

  return null;
}
