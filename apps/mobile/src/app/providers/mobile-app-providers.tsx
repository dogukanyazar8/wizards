import type { PropsWithChildren } from "react";
import { MobileDeepLinkProvider } from "./mobile-deep-link-provider";
import { MobileLocaleProvider } from "./mobile-locale-provider";
import { MobileMediaProvider } from "./mobile-media-provider";
import { MobileNotificationProvider } from "./mobile-notification-provider";
import { MobileVoiceProvider } from "./mobile-voice-provider";

export function MobileAppProviders({ children }: PropsWithChildren) {
  return (
    <MobileLocaleProvider>
      <MobileNotificationProvider>
        <MobileMediaProvider>
          <MobileVoiceProvider>
            <MobileDeepLinkProvider>{children}</MobileDeepLinkProvider>
          </MobileVoiceProvider>
        </MobileMediaProvider>
      </MobileNotificationProvider>
    </MobileLocaleProvider>
  );
}
