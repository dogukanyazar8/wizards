import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { TwoFactorClient } from "./two-factor-client";

interface TwoFactorPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * SPEC-GIRIS-KAYIT §4.2 — iki adımlı doğrulama ekranı.
 *
 * Challenge kimliği sorgu parametresinde değil sekmede taşınır (K2), bu yüzden sunucu tarafında
 * kontrol edilemez: istemci mount olduğunda challenge yoksa `/login`'e döner.
 */
export default async function TwoFactorPage({ searchParams }: TwoFactorPageProps) {
  const [params, session] = await Promise.all([searchParams, auth()]);

  if (session?.user?.id) {
    redirect("/");
  }

  const callbackUrl = getSafeAuthRedirectPath(
    typeof params?.callbackUrl === "string" ? params.callbackUrl : "",
  );

  return <TwoFactorClient callbackUrl={callbackUrl} />;
}
