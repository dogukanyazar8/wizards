import { useEffect } from "react";
import { Linking } from "react-native";
import type { MobileEnvironmentConfig } from "../config/environment";
import { parseMobileDeepLink, type MobileDeepLinkParseResult } from "./mobile-deep-links";

interface UseMobileDeepLinksOptions {
  readonly enabled?: boolean;
  readonly onDeepLink: (result: MobileDeepLinkParseResult) => void;
  readonly runtimeConfig: Pick<MobileEnvironmentConfig, "webUrl">;
}

export function useMobileDeepLinks({
  enabled = true,
  onDeepLink,
  runtimeConfig,
}: UseMobileDeepLinksOptions) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    void Linking.getInitialURL().then((url) => {
      if (isMounted && url) {
        onDeepLink(parseMobileDeepLink(url, { webUrl: runtimeConfig.webUrl }));
      }
    });

    const subscription = Linking.addEventListener("url", (event) => {
      onDeepLink(parseMobileDeepLink(event.url, { webUrl: runtimeConfig.webUrl }));
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [enabled, onDeepLink, runtimeConfig.webUrl]);
}
