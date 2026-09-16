import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import {
  buildMobileOAuthCompletePath,
  buildMobileOAuthHandoffUrl,
  getSafeMobileOAuthState,
} from "@/lib/auth/mobile-oauth-start";
import { createMobileAuthHandoffToken } from "@/lib/mobile/auth";
import { MobileOAuthCompleteClient } from "./mobile-oauth-complete-client";

interface MobileOAuthCompletePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MobileOAuthCompletePage({
  searchParams,
}: MobileOAuthCompletePageProps) {
  const [session, queryParams] = await Promise.all([auth(), searchParams]);
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;
  const callbackPath = getSafeAuthRedirectPath(callbackParam, "/messages");
  const state = getSafeMobileOAuthState(queryParams?.state);
  if (!state) {
    notFound();
  }

  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(buildMobileOAuthCompletePath(callbackPath, state))}`,
    );
  }

  const handoff = await createMobileAuthHandoffToken({
    callbackPath,
    userId: session.user.id,
  });

  return (
    <MobileOAuthCompleteClient
      appHandoffUrl={buildMobileOAuthHandoffUrl(handoff.token, handoff.callbackPath, state)}
    />
  );
}
