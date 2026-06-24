import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { createDesktopOAuthHandoffToken } from "@/lib/auth/desktop-oauth-handoff";
import { buildDesktopOAuthCompletePath } from "@/lib/auth/desktop-oauth-start";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { getServerTranslator } from "@/lib/locale/server";
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
  const [session, queryParams, { t }] = await Promise.all([
    auth(),
    searchParams,
    getServerTranslator(),
  ]);
  const callbackParam = Array.isArray(queryParams?.callbackUrl)
    ? queryParams.callbackUrl[0]
    : queryParams?.callbackUrl;
  const callbackUrl = getSafeAuthRedirectPath(callbackParam);

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(buildDesktopOAuthCompletePath(callbackUrl))}`);
  }

  const handoff = await createDesktopOAuthHandoffToken({
    callbackUrl,
    userId: session.user.id,
  });

  return (
    <DesktopOAuthCompleteClient
      callbackUrl={handoff.callbackUrl}
      desktopHandoffUrl={buildDesktopOAuthHandoffUrl(handoff.token, handoff.callbackUrl)}
      labels={{
        badge: t("auth.desktopOAuth.badge"),
        browserHint: t("auth.desktopOAuth.browserHint"),
        button: t("auth.desktopOAuth.button"),
        closeButton: t("auth.desktopOAuth.closeButton"),
        closeHint: t("auth.desktopOAuth.closeHint"),
        description: t("auth.desktopOAuth.description"),
        privacy: t("auth.desktopOAuth.privacy"),
        title: t("auth.desktopOAuth.title"),
      }}
    />
  );
}
