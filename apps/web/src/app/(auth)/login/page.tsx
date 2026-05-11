import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { LoginClient } from "./login-client";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackParam = Array.isArray(params?.callbackUrl)
    ? params.callbackUrl[0]
    : params?.callbackUrl;
  const errorParam = Array.isArray(params?.error) ? params.error[0] : params?.error;

  return (
    <LoginClient
      authError={typeof errorParam === "string" ? errorParam : null}
      callbackUrl={getSafeAuthRedirectPath(callbackParam)}
    />
  );
}
