import { useCallback } from "react";
import { Linking } from "react-native";

export function useMobileProductLinks(webUrl: string) {
  const openTrustedWebPath = useCallback(
    (path: "/cookies" | "/privacy" | "/terms") => {
      const url = new URL(path, webUrl);
      void Linking.openURL(url.toString()).catch(() => undefined);
    },
    [webUrl],
  );

  const openPrivacyPolicy = useCallback(() => {
    openTrustedWebPath("/privacy");
  }, [openTrustedWebPath]);

  const openTerms = useCallback(() => {
    openTrustedWebPath("/terms");
  }, [openTrustedWebPath]);

  const openCookies = useCallback(() => {
    openTrustedWebPath("/cookies");
  }, [openTrustedWebPath]);

  const openSupport = useCallback(() => {
    void Linking.openURL("mailto:support@whispr.team").catch(() => undefined);
  }, []);

  return { openCookies, openPrivacyPolicy, openSupport, openTerms };
}
