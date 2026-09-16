"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginFormInput, type LoginInput } from "@wizards/types";
import { ExternalLink, Loader2, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useCallback, useState, type CSSProperties } from "react";
import { useForm, useWatch } from "react-hook-form";

import { storeTwoFactorChallenge } from "@/app/(auth)/login/challenge-transport";
import {
  AuthCheckbox,
  AuthDescription,
  AuthDivider,
  AuthEyebrow,
  AuthLink,
  AuthScreenLayout,
  AuthTitle,
  PasswordInput,
  PrimaryButton,
  SocialAuthButtons,
  TextInput,
} from "@/components/auth/auth-screen";
import { AuthBlockingPanel } from "@/components/auth/auth-error-levels";
import { AuthLevelTwoBanner, useCountdown } from "@/components/auth/auth-status-view";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { SplashScreen } from "@/components/splash/splash-screen";
import { loginAction, type AuthActionResult } from "@/lib/auth/actions";
import { buildDesktopOAuthStartUrl } from "@/lib/auth/desktop-oauth-start";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

/**
 * SPEC-GIRIS-KAYIT §4.1 — giriş ekranı.
 *
 * Ekran sunucunun döndürdüğü `status` alanını okur ve SPEC §8'in üç gösterim seviyesinden
 * hangisini çizeceğine katalog üstünden karar verir; `error` anahtarı yalnız katalogda karşılığı
 * olmayan durumlar için kalır.
 *
 * İki adımlı doğrulama gerekiyorsa oturum **açılmaz**: challenge kimliği sekmeye yazılır ve
 * kullanıcı `/login/two-factor` ekranına gider (K2). Parola bu noktadan sonra hiç taşınmaz.
 */

type OAuthProvider = "google";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface LoginClientProps {
  authError?: string | null;
  callbackUrl: string;
}

function DesktopOAuthPendingDialog({
  onCancel,
  onRetry,
}: {
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  return (
    <div
      aria-describedby="desktop-oauth-pending-description"
      aria-labelledby="desktop-oauth-pending-title"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[hsl(var(--background)/0.62)] px-5 py-8 backdrop-blur-xl"
      role="dialog"
    >
      <section
        className="auth-status-card relative flex flex-col gap-[var(--auth-title-gap)] text-center"
        style={
          {
            "--auth-tone": "var(--primary)",
            "--auth-tone-soft": "var(--primary)",
          } as CSSProperties
        }
      >
        <button
          aria-label={t("common.close")}
          className="auth-link absolute right-4 top-4"
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>

        <span aria-hidden="true" className="auth-block-icon mx-auto">
          <Loader2 className="h-6 w-6 motion-safe:animate-spin" />
        </span>

        <div className="flex flex-col gap-[var(--auth-label-gap)]">
          <p className="auth-status-label">{t("auth.desktopOAuth.badge")}</p>
          <h2 className="auth-status-title" id="desktop-oauth-pending-title">
            {t("auth.desktopOAuth.pendingTitle")}
          </h2>
          <p className="auth-status-body" id="desktop-oauth-pending-description">
            {t("auth.desktopOAuth.pendingDescription")}
          </p>
        </div>

        <div className="auth-block-band">
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          <span>{t("auth.desktopOAuth.pendingBrowser")}</span>
        </div>

        <div className="flex flex-col gap-[var(--auth-title-gap)]">
          <PrimaryButton onClick={onRetry} type="button">
            <span className="inline-flex items-center justify-center gap-[var(--auth-label-gap)]">
              <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{t("auth.desktopOAuth.pendingRetry")}</span>
            </span>
          </PrimaryButton>
          <button
            className="auth-link self-center"
            data-size="small"
            onClick={onCancel}
            type="button"
          >
            {t("auth.desktopOAuth.pendingCancel")}
          </button>
        </div>
      </section>
    </div>
  );
}

export function LoginClient({ authError = null, callbackUrl }: LoginClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [result, setResult] = useState<AuthActionResult | null>(() =>
    authError ? { error: "auth.login.oauthError", success: false } : null,
  );
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [showDesktopOAuthPending, setShowDesktopOAuthPending] = useState(false);
  const [showDesktopStartup, setShowDesktopStartup] = useState(false);

  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = useForm<LoginFormInput, undefined, LoginInput>({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      turnstileToken: "",
    },
    resolver: zodResolver(LoginSchema),
  });
  const turnstileToken = useWatch({ control, name: "turnstileToken" });

  const lockCountdown = useCountdown(
    result?.status === "accountLocked" ? result.retryAfterMs : undefined,
  );

  const handleTurnstileTokenChange = useCallback(
    (token: string) => {
      setValue("turnstileToken", token, { shouldDirty: true, shouldValidate: Boolean(token) });
    },
    [setValue],
  );

  const onSubmit = async (values: LoginInput) => {
    setResult(null);
    setShowDesktopStartup(isWhisprDesktopRuntime());

    const formData = new FormData();
    formData.set("callbackUrl", callbackUrl);
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("rememberMe", values.rememberMe ? "true" : "false");
    formData.set("turnstileToken", values.turnstileToken);

    const actionResult = await loginAction(formData);

    if (actionResult.twoFactorRequired && actionResult.challengeId) {
      // Challenge URL'e yazılmaz; sekmeye konur ve `replace` geri tuşuyla forma dönmeyi keser.
      storeTwoFactorChallenge({ challengeId: actionResult.challengeId, email: values.email });
      router.replace("/login/two-factor");
      return;
    }

    if (!actionResult.success) {
      setShowDesktopStartup(false);
      setResult(actionResult);
      return;
    }

    router.replace(callbackUrl);
  };

  const openDesktopOAuthBrowser = useCallback(() => {
    window.open(
      buildDesktopOAuthStartUrl(callbackUrl, window.location.origin),
      "_blank",
      "noopener,noreferrer",
    );
  }, [callbackUrl]);

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setResult(null);
    setOauthLoading(provider);

    if (isWhisprDesktopRuntime()) {
      setShowDesktopStartup(false);
      setShowDesktopOAuthPending(true);
      openDesktopOAuthBrowser();
      setOauthLoading(null);
      return;
    }

    setShowDesktopStartup(false);

    try {
      await signIn(provider, { callbackUrl });
    } catch {
      setShowDesktopOAuthPending(false);
      setResult({ error: "auth.login.oauthError", success: false });
      setOauthLoading(null);
    }
  };

  const blockedStatus =
    result?.status === "accountLocked" || result?.status === "accountSuspended"
      ? result.status
      : null;
  const credentialsFailed = result?.status === "credentials";

  return (
    <AuthScreenLayout
      auroraTone={blockedStatus ? "danger-block" : credentialsFailed ? "danger-field" : "default"}
    >
      {showDesktopStartup ? (
        <SplashScreen step="session" surface="desktop" variant="overlay" />
      ) : null}
      {showDesktopOAuthPending ? (
        <DesktopOAuthPendingDialog
          onCancel={() => {
            setShowDesktopOAuthPending(false);
            setOauthLoading(null);
          }}
          onRetry={openDesktopOAuthBrowser}
        />
      ) : null}

      {blockedStatus ? (
        <AuthBlockingPanel
          band={
            blockedStatus === "accountLocked" ? (
              <span data-testid="login-lock-countdown">
                {t("auth.status.accountLocked.countdown", { countdown: lockCountdown.label })}
              </span>
            ) : result?.reference ? (
              <span data-testid="login-suspension-reference">
                {t("auth.status.accountSuspended.reference", { code: result.reference })}
              </span>
            ) : undefined
          }
          primaryAction={
            /*
             * SPEC §7/10 iki eylem gösteriyor: `İtiraz gönder` ve `Kuralları oku`. İtiraz ucu
             * üründe var (`/api/v1/moderation/appeal`) ama **oturum açmış yasaklı kullanıcı**
             * istiyor; giriş ekranı tam da o oturumu vermeyi reddettiği yer, yani buradan
             * ulaşılamıyor. Ölü bir düğme koymaktansa askı bloğu yalnız gerçekten çalışan
             * eylemi taşıyor; eksik yüzey rapora yazıldı.
             */
            <PrimaryButton
              onClick={() =>
                router.push(blockedStatus === "accountLocked" ? "/forgot-password" : "/terms")
              }
              type="button"
            >
              {t(
                blockedStatus === "accountLocked"
                  ? "auth.status.accountLocked.action"
                  : "auth.status.accountSuspended.secondaryAction",
              )}
            </PrimaryButton>
          }
          secondaryAction={
            <AuthLink href="/login" tone="muted">
              {t("auth.common.backToLogin")}
            </AuthLink>
          }
          statusId={blockedStatus}
        />
      ) : (
        <>
          <AuthEyebrow>{t("auth.login.eyebrow")}</AuthEyebrow>
          <AuthTitle>{t("auth.login.title")}</AuthTitle>
          <AuthDescription>{t("auth.login.subtitle")}</AuthDescription>

          <form
            className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]"
            data-testid="login-form"
            noValidate
            onSubmit={handleSubmit(onSubmit)}
          >
            <AuthLevelTwoBanner result={result} />

            <TextInput
              autoComplete="username"
              label={t("auth.field.email")}
              type="email"
              {...register("email")}
            />

            <PasswordInput
              autoComplete="current-password"
              error={credentialsFailed ? t("auth.status.credentials.field") : undefined}
              label={t("auth.field.password")}
              labelAction={
                <AuthLink href="/forgot-password" size="small">
                  {t("auth.login.forgot")}
                </AuthLink>
              }
              {...register("password")}
            />

            <AuthCheckbox
              label={t("auth.login.remember")}
              trailing={
                credentialsFailed && result?.attemptsLeft !== undefined ? (
                  <span className="auth-hint" data-testid="login-attempts-left">
                    {t("auth.status.credentials.attemptsLeft", { count: result.attemptsLeft })}
                  </span>
                ) : null
              }
              {...register("rememberMe")}
            />

            <input type="hidden" {...register("turnstileToken")} />

            {/* Managed challenges may require interaction, including inside desktop WebViews. */}
            {TURNSTILE_SITE_KEY ? (
              <TurnstileWidget
                action="login"
                compact
                verified={Boolean(turnstileToken)}
                onTokenChange={handleTurnstileTokenChange}
                siteKey={TURNSTILE_SITE_KEY}
              />
            ) : null}

            <PrimaryButton
              /*
               * Turnstile yapılandırılmamış bir ortamda (yerel geliştirme, site anahtarı yok)
               * widget hiç çizilmiyor ve token gelmiyor; düğmeyi o durumda kilitlemek ekranı
               * tamamen kullanılamaz yapardı.
               */
              disabled={isSubmitting || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
              loading={isSubmitting}
              type="submit"
            >
              {t("auth.login.cta")}
            </PrimaryButton>
          </form>

          <AuthDivider />

          <SocialAuthButtons
            disabled={oauthLoading !== null || showDesktopOAuthPending}
            onSelect={() => handleOAuthSignIn("google")}
          />

          <p className="auth-footnote mt-[var(--auth-title-gap)] text-center">
            {t("auth.login.noAccount")}{" "}
            <AuthLink href="/register" size="small">
              {t("auth.login.createAccount")}
            </AuthLink>
          </p>
        </>
      )}
    </AuthScreenLayout>
  );
}
