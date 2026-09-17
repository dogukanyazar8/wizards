import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { DesktopOAuthStartClient } from "./desktop-oauth-start-client";

interface DesktopOAuthStartPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DesktopOAuthStartPage({ searchParams }: DesktopOAuthStartPageProps) {
  const queryParams = await searchParams;
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;
  const callbackUrl = getSafeAuthRedirectPath(callbackParam);

  const requestId =
    typeof queryParams?.request === "string" && queryParams.request.length <= 64
      ? queryParams.request
      : undefined;
  return <DesktopOAuthStartClient callbackUrl={callbackUrl} requestId={requestId} />;
}
