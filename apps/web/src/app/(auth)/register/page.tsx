import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { RegisterClient } from "./register-client";

interface RegisterPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** SPEC-GIRIS-KAYIT §4.4 — hesap oluştur. */
export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const [params, session] = await Promise.all([searchParams, auth()]);

  if (session?.user?.id) {
    redirect("/");
  }

  const callbackUrl = getSafeAuthRedirectPath(
    typeof params?.callbackUrl === "string" ? params.callbackUrl : "",
  );

  return <RegisterClient callbackUrl={callbackUrl} />;
}
