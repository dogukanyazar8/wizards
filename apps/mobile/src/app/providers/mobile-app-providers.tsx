import type { PropsWithChildren } from "react";
import { MobileDeepLinkProvider } from "./mobile-deep-link-provider";
import { MobileLocaleProvider } from "./mobile-locale-provider";
import { MobileMediaProvider } from "./mobile-media-provider";
import { MobileNotificationProvider } from "./mobile-notification-provider";
import { MobileRealtimeProvider } from "./mobile-realtime-provider";
import { MobileVoiceProvider } from "./mobile-voice-provider";
import { MobileWorkspaceLayoutProvider } from "./mobile-workspace-layout-provider";

export function MobileAppProviders({ children }: PropsWithChildren) {
  return (
    <MobileLocaleProvider>
      <MobileNotificationProvider>
        <MobileMediaProvider>
          <MobileVoiceProvider>
            <MobileRealtimeProvider>
              <MobileWorkspaceLayoutProvider>
                <MobileDeepLinkProvider>{children}</MobileDeepLinkProvider>
              </MobileWorkspaceLayoutProvider>
            </MobileRealtimeProvider>
          </MobileVoiceProvider>
        </MobileMediaProvider>
      </MobileNotificationProvider>
    </MobileLocaleProvider>
  );
}
