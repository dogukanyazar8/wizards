import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { BackupCodeClient } from "./backup-code-client";

interface BackupCodePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** SPEC-GIRIS-KAYIT §4.3 — yedek kodla giriş. Aynı challenge'ı tüketir. */
export default async function BackupCodePage({ searchParams }: BackupCodePageProps) {
  const [params, session] = await Promise.all([searchParams, auth()]);

  if (session?.user?.id) {
    redirect("/");
  }

  const callbackUrl = getSafeAuthRedirectPath(
    typeof params?.callbackUrl === "string" ? params.callbackUrl : "",
  );

  return <BackupCodeClient callbackUrl={callbackUrl} />;
}
