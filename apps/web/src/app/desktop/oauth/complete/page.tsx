import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createDesktopOAuthHandoffToken } from "@/lib/auth/desktop-oauth-handoff";
import { buildDesktopOAuthCompletePath } from "@/lib/auth/desktop-oauth-start";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { DesktopOAuthCompleteClient } from "./desktop-oauth-complete-client";

interface DesktopOAuthCompletePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function buildDesktopOAuthHandoffUrl(token: string, callbackUrl: string) {
  return `whispr://oauth/${encodeURIComponent(token)}?callbackUrl=${encodeURIComponent(
    callbackUrl,
  )}`;
}

export default async function DesktopOAuthCompletePage({
  searchParams,
}: DesktopOAuthCompletePageProps) {
  const [session, queryParams] = await Promise.all([auth(), searchParams]);
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;
  const callbackUrl = getSafeAuthRedirectPath(callbackParam);
  const attemptId = typeof queryParams?.attempt === "string" ? queryParams.attempt : undefined;

  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(buildDesktopOAuthCompletePath(callbackUrl))}`,
    );
  }

  const handoff = await createDesktopOAuthHandoffToken({
    callbackUrl,
    userId: session.user.id,
  });

  return (
    <DesktopOAuthCompleteClient
      callbackUrl={handoff.callbackUrl}
      attemptId={attemptId}
      desktopHandoffUrl={buildDesktopOAuthHandoffUrl(handoff.token, handoff.callbackUrl)}
    />
  );
}
