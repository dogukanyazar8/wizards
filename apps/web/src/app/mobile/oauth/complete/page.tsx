import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { createMobileAuthHandoffToken } from "@/lib/mobile/auth";
import { MobileOAuthCompleteClient } from "./mobile-oauth-complete-client";

interface MobileOAuthCompletePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function buildMobileOAuthCompletePath(callbackPath: string) {
  return `/mobile/oauth/complete?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

function buildMobileOAuthHandoffUrl(token: string, callbackPath: string) {
  return `whispr://oauth/${encodeURIComponent(token)}?callbackUrl=${encodeURIComponent(
    callbackPath,
  )}`;
}

export default async function MobileOAuthCompletePage({
  searchParams,
}: MobileOAuthCompletePageProps) {
  const [session, queryParams] = await Promise.all([auth(), searchParams]);
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;
  const callbackPath = getSafeAuthRedirectPath(callbackParam, "/channels/@me");

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(buildMobileOAuthCompletePath(callbackPath))}`);
  }

  const handoff = await createMobileAuthHandoffToken({
    callbackPath,
    userId: session.user.id,
  });

  return (
    <MobileOAuthCompleteClient
      appHandoffUrl={buildMobileOAuthHandoffUrl(handoff.token, handoff.callbackPath)}
      callbackPath={handoff.callbackPath}
    >
      <BrandLogo className="mx-auto justify-center" interactive={false} />
    </MobileOAuthCompleteClient>
  );
}
