import { notFound } from "next/navigation";

import { getSafeMobileOAuthProvider, getSafeMobileOAuthState } from "@/lib/auth/mobile-oauth-start";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { MobileOAuthStartClient } from "./mobile-oauth-start-client";

interface MobileOAuthStartPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MobileOAuthStartPage({ searchParams }: MobileOAuthStartPageProps) {
  const queryParams = await searchParams;
  const callbackUrl = getSafeAuthRedirectPath(
    readSingleParam(queryParams?.callbackUrl),
    "/messages",
  );
  const provider = getSafeMobileOAuthProvider(readSingleParam(queryParams?.provider));
  const state = getSafeMobileOAuthState(queryParams?.state);
  if (!state) {
    notFound();
  }

  return <MobileOAuthStartClient callbackUrl={callbackUrl} provider={provider} state={state} />;
}
