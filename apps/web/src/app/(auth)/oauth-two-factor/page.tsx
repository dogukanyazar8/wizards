import { cookies } from "next/headers";

import {
  getAuthJsCallbackCookieName,
  getSafeOAuthCallbackPath,
  type OAuthTwoFactorProvider,
} from "@/lib/auth/oauth-two-factor";
import { OAuthTwoFactorClient } from "./oauth-two-factor-client";

export const dynamic = "force-dynamic";

type OAuthTwoFactorPageProps = {
  searchParams: Promise<{
    challenge?: string | string[];
    provider?: string | string[];
  }>;
};

function readSingleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function readProvider(value: string): OAuthTwoFactorProvider | null {
  return value === "google" || value === "github" ? value : null;
}

export default async function OAuthTwoFactorPage({ searchParams }: OAuthTwoFactorPageProps) {
  const params = await searchParams;
  const challengeToken = readSingleParam(params.challenge);
  const provider = readProvider(readSingleParam(params.provider));
  const validChallenge = /^[A-Za-z0-9_-]{16,256}$/.test(challengeToken);
  const cookieStore = await cookies();
  const callbackUrl = getSafeOAuthCallbackPath(
    cookieStore.get(getAuthJsCallbackCookieName())?.value,
  );

  return (
    <OAuthTwoFactorClient
      callbackUrl={callbackUrl}
      challengeToken={validChallenge ? challengeToken : null}
      provider={provider}
    />
  );
}
