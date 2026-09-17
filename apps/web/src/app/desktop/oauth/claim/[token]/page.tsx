import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
  const [routeParams, queryParams, session] = await Promise.all([params, searchParams, auth()]);
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;
  const callbackUrl = getSafeAuthRedirectPath(callbackParam);
  if (session?.user?.id) {
    redirect(callbackUrl);
  }

  return <DesktopOAuthClaimClient callbackUrl={callbackUrl} token={routeParams.token} />;
}
