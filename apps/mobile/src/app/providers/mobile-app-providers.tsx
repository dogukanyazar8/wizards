import type { PropsWithChildren } from "react";
import { MobileAppearanceSyncBridge } from "./mobile-appearance-sync-bridge";
import { MobileDeepLinkProvider } from "./mobile-deep-link-provider";
import { MobileHealthReporterBridge } from "./mobile-health-reporter-bridge";
import { MobileLocaleProvider } from "./mobile-locale-provider";
import { MobileMediaProvider } from "./mobile-media-provider";
import { MobileNotificationProvider } from "./mobile-notification-provider";
import { MobileNotificationPreferencesProvider } from "./mobile-notification-preferences-provider";
import { MobilePushResponseBridge } from "./mobile-push-response-bridge";
import { MobileRealtimeProvider } from "./mobile-realtime-provider";
import { MobileVoiceProvider } from "./mobile-voice-provider";
import { MobileWorkspaceLayoutProvider } from "./mobile-workspace-layout-provider";
import { MobileProfileCardProvider } from "../../social/profile-card";
import { MobilePerformanceAutomationProvider } from "./mobile-performance-automation-provider";

export function MobileAppProviders({ children }: PropsWithChildren) {
  return (
    <MobileLocaleProvider>
      <MobileNotificationProvider>
        <MobileMediaProvider>
          <MobileVoiceProvider>
            <MobileRealtimeProvider>
              <MobilePushResponseBridge />
              <MobileHealthReporterBridge />
              <MobileAppearanceSyncBridge />
              <MobileWorkspaceLayoutProvider>
                <MobileNotificationPreferencesProvider>
                  {/* 11b: one card for the whole app, mounted above the shell so
                      every avatar surface shares its cache and back-key stack. */}
                  <MobileProfileCardProvider>
                    <MobilePerformanceAutomationProvider>
                      <MobileDeepLinkProvider>{children}</MobileDeepLinkProvider>
                    </MobilePerformanceAutomationProvider>
                  </MobileProfileCardProvider>
                </MobileNotificationPreferencesProvider>
              </MobileWorkspaceLayoutProvider>
            </MobileRealtimeProvider>
          </MobileVoiceProvider>
        </MobileMediaProvider>
      </MobileNotificationProvider>
    </MobileLocaleProvider>
  );
}
