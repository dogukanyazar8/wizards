import { verifyPasswordResetToken } from "@/lib/auth/password-reset";
import { ResetPasswordClient } from "./reset-password-client";

export const dynamic = "force-dynamic";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

function getToken(searchToken: string | string[] | undefined) {
  return typeof searchToken === "string" ? searchToken : "";
}

/**
 * SPEC-GIRIS-KAYIT §4.7 — `Yeni şifre belirle`.
 *
 * Token sunucuda **önceden** doğrulanır: süresi geçmiş bir bağlantıyla gelen kullanıcı formu hiç
 * görmez, doğrudan seviye 3 bloğa düşer (SPEC §7/8). Geçersiz token boş dizeyle geçilir ve
 * istemci aynı bloğu çizer.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;
  const rawToken = getToken(token);
  const verification = await verifyPasswordResetToken(rawToken).catch(() => ({
    status: "invalid" as const,
  }));

  return <ResetPasswordClient token={verification.status === "valid" ? verification.token : ""} />;
}
