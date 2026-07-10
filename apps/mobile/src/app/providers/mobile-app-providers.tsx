import type { PropsWithChildren } from "react";
import { MobileDeepLinkProvider } from "./mobile-deep-link-provider";
import { MobileLocaleProvider } from "./mobile-locale-provider";
import { MobileMediaProvider } from "./mobile-media-provider";
import { MobileNotificationProvider } from "./mobile-notification-provider";
import { MobileRealtimeProvider } from "./mobile-realtime-provider";
import { MobileVoiceProvider } from "./mobile-voice-provider";

export function MobileAppProviders({ children }: PropsWithChildren) {
  return (
    <MobileLocaleProvider>
      <MobileNotificationProvider>
        <MobileMediaProvider>
          <MobileVoiceProvider>
            <MobileRealtimeProvider>
              <MobileDeepLinkProvider>{children}</MobileDeepLinkProvider>
            </MobileRealtimeProvider>
          </MobileVoiceProvider>
        </MobileMediaProvider>
      </MobileNotificationProvider>
    </MobileLocaleProvider>
  );
}
