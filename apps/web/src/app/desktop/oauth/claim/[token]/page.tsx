import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { getServerTranslator } from "@/lib/locale/server";
import { DesktopOAuthClaimClient } from "./desktop-oauth-claim-client";

interface DesktopOAuthClaimPageProps {
  params: Promise<{
    token: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DesktopOAuthClaimPage({
  params,
  searchParams,
}: DesktopOAuthClaimPageProps) {
  const [routeParams, queryParams, { t }] = await Promise.all([
    params,
    searchParams,
    getServerTranslator(),
  ]);
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;

  return (
    <DesktopOAuthClaimClient
      callbackUrl={getSafeAuthRedirectPath(callbackParam)}
      labels={{
        browserDescription: t("auth.desktopOAuth.claimBrowserDescription"),
        browserTitle: t("auth.desktopOAuth.claimBrowserTitle"),
        button: t("auth.desktopOAuth.claimButton"),
        failed: t("auth.desktopOAuth.failed"),
        invalid: t("auth.desktopOAuth.invalid"),
        privacy: t("auth.desktopOAuth.privacy"),
      }}
      token={routeParams.token}
    />
  );
}
