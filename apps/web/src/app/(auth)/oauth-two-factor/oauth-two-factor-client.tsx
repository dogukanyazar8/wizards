"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

import {
  AuthCheckbox,
  AuthDescription,
  AuthEyebrow,
  AuthScreenLayout,
  AuthTitle,
  PrimaryButton,
  TextInput,
} from "@/components/auth/auth-screen";
import { useI18n } from "@/components/providers/locale-provider";
import type { OAuthTwoFactorProvider } from "@/lib/auth/oauth-two-factor";

type OAuthTwoFactorClientProps = {
  callbackUrl: string;
  challengeToken: string | null;
  provider: OAuthTwoFactorProvider | null;
};

export function OAuthTwoFactorClient({
  callbackUrl,
  challengeToken,
  provider,
}: OAuthTwoFactorClientProps) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const challengeReady = Boolean(challengeToken && provider);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim();
    if (!challengeToken || !provider || !normalizedCode || submitting) {
      if (!normalizedCode) {
        setError(t("auth.oauthTwoFactor.invalidCode"));
      }
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/auth/oauth-two-factor", {
        body: JSON.stringify({ challengeToken, twoFactorCode: normalizedCode, rememberDevice }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        code?: unknown;
        provider?: unknown;
      } | null;

      if (!response.ok || payload?.provider !== provider) {
        setError(
          payload?.code === "TWO_FACTOR_INVALID"
            ? t("auth.oauthTwoFactor.invalidCode")
            : t("auth.oauthTwoFactor.genericError"),
        );
        return;
      }

      await signIn(provider, { callbackUrl });
    } catch {
      setError(t("auth.oauthTwoFactor.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreenLayout>
      <AuthEyebrow>{t("auth.oauthTwoFactor.badge")}</AuthEyebrow>
      <AuthTitle>{t("auth.oauthTwoFactor.title")}</AuthTitle>
      <AuthDescription>{t("auth.oauthTwoFactor.body")}</AuthDescription>

      {challengeReady ? (
        <form
          className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]"
          onSubmit={handleSubmit}
        >
          <TextInput
            autoCapitalize="none"
            autoComplete="one-time-code"
            autoCorrect="off"
            error={error}
            id="oauth-two-factor-code"
            label={t("auth.oauthTwoFactor.codeLabel")}
            maxLength={64}
            onChange={(event) => {
              setCode(event.target.value);
              setError(null);
            }}
            placeholder={t("auth.oauthTwoFactor.codePlaceholder")}
            value={code}
          />
          <AuthCheckbox
            checked={rememberDevice}
            label={t("auth.twoFactor.rememberDevice")}
            onChange={(event) => setRememberDevice(event.target.checked)}
          />
          <PrimaryButton disabled={submitting} loading={submitting} type="submit">
            {submitting ? t("auth.oauthTwoFactor.submitting") : t("auth.oauthTwoFactor.submit")}
          </PrimaryButton>
        </form>
      ) : (
        <div className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]">
          <p className="auth-field-error" role="alert">
            {t("auth.oauthTwoFactor.invalidChallenge")}
          </p>
          <Link className="auth-btn-primary" href="/login">
            {t("auth.oauthTwoFactor.backToLogin")}
          </Link>
        </div>
      )}
    </AuthScreenLayout>
  );
}
