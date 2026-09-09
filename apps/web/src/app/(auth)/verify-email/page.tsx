import { CheckCircle2, Clock3, MailWarning } from "lucide-react";

import {
  AuthDescription,
  AuthEyebrow,
  AuthScreenLayout,
  AuthTitle,
  SecondaryButton,
} from "@/components/auth/auth-screen";
import { AuthSuccessTile } from "@/components/auth/auth-pieces";
import { verifyEmailToken, type EmailVerificationResult } from "@/lib/auth/email-verification";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { getServerTranslator } from "@/lib/locale/server";
import { VerifyEmailClient } from "./verify-email-client";

export const dynamic = "force-dynamic";

type VerifyEmailPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * SPEC-GIRIS-KAYIT §4.5 — e-posta doğrulama.
 *
 * İki mod (paket kararı K3):
 *  - `?token=…` → gönderilmiş **bağlantı** tüketilir; sonuç ekranı burada, sunucuda çizilir.
 *  - token yok → altı haneli **kod** ekranı (istemci).
 *
 * Link akışı kaldırılmadı: gönderilmiş bağlantılar çalışmaya devam ediyor ve iki yol da aynı
 * doğrulama servisinden geçiyor.
 */
function getSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const token = getSingle(params.token);
  const next = getSafeAuthRedirectPath(getSingle(params.next));

  if (!token) {
    return <VerifyEmailClient next={next} />;
  }

  const { t } = await getServerTranslator();

  let result: EmailVerificationResult;
  try {
    result = await verifyEmailToken(token);
  } catch {
    result = { status: "invalid" };
  }

  if (result.status === "verified") {
    return (
      <AuthScreenLayout align="center" auroraTone="success">
        <AuthSuccessTile />
        <div className="mt-[var(--auth-success-gap)]">
          <AuthEyebrow>{t("auth.verifyEmail.eyebrow")}</AuthEyebrow>
          <AuthTitle>{t("auth.verifyEmail.successTitle")}</AuthTitle>
          <AuthDescription>{t("auth.verifyEmail.successBody")}</AuthDescription>
        </div>
        <div className="mt-[var(--auth-title-gap)]">
          <SecondaryButton href="/login">{t("auth.login.cta")}</SecondaryButton>
        </div>
      </AuthScreenLayout>
    );
  }

  const expired = result.status === "expired";
  const Icon = expired ? Clock3 : MailWarning;

  /*
   * SPEC §8/3 ve §7/8 — süresi geçmiş ya da geçersiz bağlantı formu değil, **bloğu** gösterir:
   * kullanıcı buradan devam edemez, tek yolu yeni bir bağlantı istemek.
   */
  return (
    <AuthScreenLayout auroraTone="danger-block">
      <span aria-hidden="true" className="auth-block-icon">
        <Icon className="h-6 w-6" />
      </span>
      <p className="auth-status-label mt-[var(--auth-label-gap)]">
        {t(expired ? "auth.status.linkExpired.label" : "auth.verifyEmail.badge")}
      </p>
      <h1 className="auth-block-title">
        {t(expired ? "auth.status.linkExpired.title" : "auth.verifyEmail.invalidTitle")}
      </h1>
      <AuthDescription>
        {t(expired ? "auth.status.linkExpired.description" : "auth.verifyEmail.invalidBody")}
      </AuthDescription>

      {/*
       * `Yeni bağlantı gönder` bağlantıyı tıklayan tarayıcıda adresi bilmiyor (token'da adres
       * taşınmıyor). Bu yüzden eylem kod ekranına gider: sekmede bekleyen adres varsa oradan
       * yeniden gönderilir, yoksa ekran `E-posta adresini değiştir` yolunu sunar.
       */}
      <div className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-label-gap)]">
        <SecondaryButton href="/verify-email">
          {t("auth.status.linkExpired.action")}
        </SecondaryButton>
        <SecondaryButton href="/login">{t("auth.common.backToLogin")}</SecondaryButton>
      </div>

      <p className="auth-hint mt-[var(--auth-label-gap)] flex items-center gap-[var(--auth-label-gap)]">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
        {t("auth.verifyEmail.nextStepBody")}
      </p>
    </AuthScreenLayout>
  );
}
