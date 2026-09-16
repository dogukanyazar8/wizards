import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
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
  const [routeParams, queryParams] = await Promise.all([params, searchParams]);
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;

  return (
    <DesktopOAuthClaimClient
      callbackUrl={getSafeAuthRedirectPath(callbackParam)}
      token={routeParams.token}
    />
  );
}
