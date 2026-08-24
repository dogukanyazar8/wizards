import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { resolveLoginRedirect } from "@/lib/auth/login-redirect";
import { LoginClient } from "./login-client";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [params, session] = await Promise.all([searchParams, auth()]);
  const resolution = resolveLoginRedirect({
    callbackUrl: params?.callbackUrl,
    error: params?.error,
    hasSession: Boolean(session?.user?.id),
  });

  if (resolution.redirectTo) {
    redirect(resolution.redirectTo);
  }

  return <LoginClient authError={resolution.authError} callbackUrl={resolution.callbackUrl} />;
}
