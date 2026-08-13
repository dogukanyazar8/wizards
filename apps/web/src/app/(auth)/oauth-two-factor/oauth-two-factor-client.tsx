"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

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
        body: JSON.stringify({ challengeToken, twoFactorCode: normalizedCode }),
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
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="app-badge-accent inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("auth.oauthTwoFactor.badge")}
        </div>
        <div>
          <h1 className="text-app-foreground text-4xl font-semibold tracking-tight">
            {t("auth.oauthTwoFactor.title")}
          </h1>
          <p className="text-app-muted mt-3 text-sm leading-7">{t("auth.oauthTwoFactor.body")}</p>
        </div>
      </div>

      {challengeReady ? (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2" htmlFor="oauth-two-factor-code">
            <span className="text-app-foreground text-sm font-semibold">
              {t("auth.oauthTwoFactor.codeLabel")}
            </span>
            <span className="app-input flex h-14 items-center gap-3 rounded-2xl border px-4">
              <KeyRound className="text-app-muted h-5 w-5" aria-hidden="true" />
              <input
                autoCapitalize="none"
                autoComplete="one-time-code"
                autoCorrect="off"
                className="text-app-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
                id="oauth-two-factor-code"
                maxLength={64}
                onChange={(event) => {
                  setCode(event.target.value);
                  setError(null);
                }}
                placeholder={t("auth.oauthTwoFactor.codePlaceholder")}
                value={code}
              />
            </span>
          </label>

          {error ? (
            <p className="text-sm font-medium text-[hsl(var(--danger))]" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="app-button-primary inline-flex h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? t("auth.oauthTwoFactor.submitting") : t("auth.oauthTwoFactor.submit")}
          </button>
        </form>
      ) : (
        <div className="space-y-5">
          <p className="rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.1)] p-4 text-sm text-[hsl(var(--danger))]">
            {t("auth.oauthTwoFactor.invalidChallenge")}
          </p>
          <Link
            className="app-button-primary inline-flex h-12 w-full items-center justify-center rounded-2xl px-4 text-sm font-semibold"
            href="/login"
          >
            {t("auth.oauthTwoFactor.backToLogin")}
          </Link>
        </div>
      )}
    </div>
  );
}
