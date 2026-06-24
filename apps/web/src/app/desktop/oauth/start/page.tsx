import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { getServerTranslator } from "@/lib/locale/server";
import { DesktopOAuthStartClient } from "./desktop-oauth-start-client";

interface DesktopOAuthStartPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DesktopOAuthStartPage({ searchParams }: DesktopOAuthStartPageProps) {
  const [queryParams, { t }] = await Promise.all([searchParams, getServerTranslator()]);
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;
  const callbackUrl = getSafeAuthRedirectPath(callbackParam);

  return (
    <DesktopOAuthStartClient
      callbackUrl={callbackUrl}
      labels={{
        badge: t("auth.desktopOAuth.badge"),
        button: t("auth.desktopOAuth.startButton"),
        description: t("auth.desktopOAuth.startDescription"),
        failed: t("auth.login.oauthError"),
        privacy: t("auth.desktopOAuth.privacy"),
        retry: t("auth.desktopOAuth.startRetry"),
        title: t("auth.desktopOAuth.startTitle"),
      }}
    />
  );
}
