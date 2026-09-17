"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  RegisterSchema,
  evaluatePasswordStrength,
  meetsPasswordPolicy,
  type RegisterInput,
} from "@wizards/types";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  AuthCheckbox,
  AuthDescription,
  AuthEyebrow,
  AuthLink,
  AuthScreenLayout,
  AuthTitle,
  PasswordInput,
  PrimaryButton,
  TextInput,
} from "@/components/auth/auth-screen";
import { AuthPasswordStrength } from "@/components/auth/auth-password-strength";
import { AuthSuggestionChip } from "@/components/auth/auth-pieces";
import { AuthLevelTwoBanner } from "@/components/auth/auth-status-view";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { registerAction, type AuthActionResult } from "@/lib/auth/actions";
import { storePendingVerificationEmail } from "@/lib/auth/pending-verification";

/**
 * SPEC-GIRIS-KAYIT §4.4 — hesap oluştur.
 *
 * Dört alan: Ad Soyad · Kullanıcı adı · E-posta · Şifre. Şifre tekrar alanı **yok** (K10) ve
 * telefon dalı bu pakette kapsam dışı (K1) — alan yalnız e-posta kabul eder, algılama satırı
 * SPEC'in geometrisini koruyarak `E-posta adresi algılandı` yazar.
 *
 * Bu ekranda alt bilgi yoktur (K13): form dikey alanı doldurur.
 */

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type UsernameCheck = {
  available: boolean;
  suggestions: string[];
  username: string;
};

async function checkUsername(username: string): Promise<UsernameCheck | null> {
  try {
    const response = await fetch("/api/v1/auth/username-availability", {
      body: JSON.stringify({ username }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { available?: boolean; suggestions?: string[] };

    return {
      available: Boolean(payload.available),
      suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
      username,
    };
  } catch {
    /*
     * Ağ hatasında sessizce geçilir: kullanıcı adı sunucuda yine doğrulanacak, kullanıcıyı
     * yazarken bir hata bandıyla durdurmanın karşılığı yok.
     */
    return null;
  }
}

export function RegisterClient({ callbackUrl }: { callbackUrl: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheck | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = useForm<RegisterInput>({
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      turnstileToken: "",
      username: "",
    },
    resolver: zodResolver(RegisterSchema),
  });

  const displayName = useWatch({ control, name: "displayName" }) ?? "";
  const email = useWatch({ control, name: "email" }) ?? "";
  const password = useWatch({ control, name: "password" }) ?? "";
  const username = useWatch({ control, name: "username" }) ?? "";
  const normalizedUsername = username.trim();
  const turnstileToken = useWatch({ control, name: "turnstileToken" }) ?? "";

  const strength = evaluatePasswordStrength(password);
  const emailDetected = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const usernameTaken =
    result?.status === "usernameTaken" ||
    (usernameCheck !== null && usernameCheck.username === username && !usernameCheck.available);

  const handleTurnstileTokenChange = useCallback(
    (token: string) => {
      setValue("turnstileToken", token, { shouldDirty: true, shouldValidate: Boolean(token) });
    },
    [setValue],
  );

  const handleUsernameBlur = useCallback(async () => {
    const candidate = username.trim();

    if (candidate.length < 2) {
      setUsernameCheck(null);
      return;
    }

    setCheckingUsername(true);
    const check = await checkUsername(candidate);
    setCheckingUsername(false);
    setUsernameCheck(check);
  }, [username]);

  const applySuggestion = useCallback(
    (suggestion: string) => {
      setValue("username", suggestion, { shouldDirty: true, shouldValidate: true });
      setUsernameCheck(null);
      setResult((current) => (current?.status === "usernameTaken" ? null : current));
    },
    [setValue],
  );

  const onSubmit = async (values: RegisterInput) => {
    setResult(null);

    const formData = new FormData();
    formData.set("displayName", values.displayName);
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("turnstileToken", values.turnstileToken);
    formData.set("username", values.username);

    const actionResult = await registerAction(formData);

    if (!actionResult.success) {
      handleTurnstileTokenChange("");
      setTurnstileResetKey((key) => key + 1);
      setResult(actionResult);
      return;
    }

    // Adres URL'e yazılmaz; doğrulama ekranı sekmeden okur.
    storePendingVerificationEmail(actionResult.email ?? values.email);
    router.replace(`/verify-email?next=${encodeURIComponent(callbackUrl)}`);
  };

  /** SPEC §10 — dört alan dolu, parola politikası geçilmiş, şartlar onaylı ve Turnstile hazır. */
  const canSubmit =
    displayName.trim().length >= 2 &&
    username.trim().length >= 2 &&
    emailDetected &&
    meetsPasswordPolicy(password) &&
    termsAccepted &&
    (!TURNSTILE_SITE_KEY || Boolean(turnstileToken));

  return (
    <AuthScreenLayout
      auroraTone={result && !result.success ? "danger-field" : "default"}
      variant="register"
    >
      <AuthEyebrow>{t("auth.register.eyebrow")}</AuthEyebrow>
      <AuthTitle>{t("auth.register.title")}</AuthTitle>
      <AuthDescription>{t("auth.register.subtitle")}</AuthDescription>

      <form
        className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]"
        data-testid="register-form"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <AuthLevelTwoBanner result={result} />

        <div>
          <div className="grid grid-cols-2 gap-[var(--auth-field-grid-gap)]">
            <TextInput
              autoComplete="name"
              fieldSize="compact"
              label={t("auth.field.fullName")}
              {...register("displayName")}
            />
            <TextInput
              autoComplete="username"
              error={usernameTaken ? t("auth.status.usernameTaken.title") : undefined}
              fieldSize="compact"
              label={t("auth.field.username")}
              tone="warning"
              {...register("username", { onBlur: handleUsernameBlur })}
            />
          </div>

          {/*
           * SPEC §4.4/1 ipucu `whispr.app/@ada` yazıyor; üründe ne o alan adı ne de
           * `/@kullaniciadi` rotası var. Adres düştü, örnek ad yerine **yazılan** ad gösteriliyor:
           * satır ancak böyle gerçekten kullanıcının adını tarif ediyor.
           */}
          <p className="auth-hint mt-[var(--auth-label-gap)]">
            {normalizedUsername
              ? t("auth.register.usernameHint", { username: normalizedUsername })
              : t("auth.register.usernameHintEmpty")}
          </p>

          {usernameTaken && !checkingUsername ? (
            <div
              className="mt-[var(--auth-label-gap)] flex flex-wrap gap-[var(--auth-label-gap)]"
              data-testid="username-suggestions"
            >
              {(usernameCheck?.suggestions ?? []).map((suggestion) => (
                <AuthSuggestionChip key={suggestion} onSelect={() => applySuggestion(suggestion)}>
                  {suggestion}
                </AuthSuggestionChip>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <TextInput
            autoComplete="email"
            error={
              result?.status === "emailRegistered"
                ? t("auth.status.emailRegistered.title")
                : undefined
            }
            label={t("auth.field.email")}
            placeholder={t("auth.field.emailPlaceholder")}
            tone="warning"
            type="email"
            {...register("email")}
          />

          {/*
           * Algılama satırı yer kaplamaya devam eder: görünüp kaybolurken formun düzeni
           * zıplamasın (SPEC §4.4/2 geometrisi sabit).
           */}
          <p
            aria-live="polite"
            className="auth-hint mt-[var(--auth-label-gap)]"
            data-testid="contact-detection"
            style={{ color: emailDetected ? "hsl(var(--success))" : "transparent" }}
          >
            {emailDetected ? `✓ ${t("auth.field.emailDetected")}` : " "}
          </p>

          {result?.status === "emailRegistered" ? (
            <div className="mt-[var(--auth-label-gap)] flex gap-[var(--auth-strength-col-gap)]">
              <AuthLink href="/login" size="small">
                {t("auth.login.cta")}
              </AuthLink>
              <AuthLink href="/forgot-password" size="small">
                {t("auth.status.accountLocked.action")}
              </AuthLink>
            </div>
          ) : null}
        </div>

        <div>
          <PasswordInput
            autoComplete="new-password"
            error={
              result?.status === "passwordWeak" ? t("auth.status.passwordWeak.field") : undefined
            }
            label={t("auth.field.password")}
            placeholder={t("auth.field.passwordPlaceholder")}
            tone="warning"
            {...register("password")}
          />

          <div className="mt-[var(--auth-label-gap)]">
            <AuthPasswordStrength strength={strength} />
          </div>
        </div>

        {TURNSTILE_SITE_KEY ? (
          <TurnstileWidget
            resetKey={turnstileResetKey}
            action="register"
            compact
            verified={Boolean(turnstileToken)}
            onTokenChange={handleTurnstileTokenChange}
            siteKey={TURNSTILE_SITE_KEY}
          />
        ) : null}

        <AuthCheckbox
          checked={termsAccepted}
          label={t("auth.register.terms")}
          onChange={(event) => setTermsAccepted(event.target.checked)}
        />

        <input type="hidden" {...register("turnstileToken")} />

        <PrimaryButton disabled={!canSubmit || isSubmitting} loading={isSubmitting} type="submit">
          {t("auth.register.cta")}
        </PrimaryButton>
      </form>

      <p className="auth-footnote mt-[var(--auth-title-gap)] text-center">
        {t("auth.register.haveAccount")}{" "}
        <AuthLink href="/login" size="small">
          {t("auth.login.cta")}
        </AuthLink>
      </p>
    </AuthScreenLayout>
  );
}
