"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  clearTwoFactorChallenge,
  readTwoFactorChallenge,
  type PendingTwoFactorChallenge,
} from "@/app/(auth)/login/challenge-transport";
import {
  AuthDescription,
  AuthEyebrow,
  AuthLink,
  AuthScreenLayout,
  AuthTitle,
  PrimaryButton,
  TextInput,
} from "@/components/auth/auth-screen";
import { AuthLevelTwoBanner } from "@/components/auth/auth-status-view";
import { useI18n } from "@/components/providers/locale-provider";
import { useHydrated } from "@/hooks/use-hydrated";
import type { AuthActionResult } from "@/lib/auth/actions";
import { submitBackupCodeAction } from "@/lib/auth/two-factor-login-actions";

/**
 * SPEC-GIRIS-KAYIT §4.3 — `Yedek kodunu gir`.
 *
 * Görüntü maskesi 4-4-2 (`7QF4-2KDX-9M`); sunucuya **normalize** değer gider (büyük harf,
 * ayraçsız), böylece kullanıcı tireli ya da tiresiz yapıştırsa da kod tutar.
 */

const GROUP_SIZES = [4, 4, 2];
const MAX_LENGTH = GROUP_SIZES.reduce((total, size) => total + size, 0);

export function formatBackupCode(rawValue: string): string {
  const normalized = rawValue
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, MAX_LENGTH);
  const groups: string[] = [];
  let cursor = 0;

  for (const size of GROUP_SIZES) {
    if (cursor >= normalized.length) {
      break;
    }

    groups.push(normalized.slice(cursor, cursor + size));
    cursor += size;
  }

  return groups.join("-");
}

export function BackupCodeClient({ callbackUrl }: { callbackUrl: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const [challenge] = useState<PendingTwoFactorChallenge | null>(readTwoFactorChallenge);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hydrated && !challenge) {
      router.replace("/login");
    }
  }, [challenge, hydrated, router]);

  if (!hydrated || !challenge) {
    return null;
  }

  const codeInvalid = result?.status === "codeInvalid";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    const formData = new FormData();
    formData.set("backupCode", value);
    formData.set("callbackUrl", callbackUrl);
    formData.set("challengeId", challenge.challengeId);

    const actionResult = await submitBackupCodeAction(formData);
    setSubmitting(false);

    if (actionResult.success) {
      clearTwoFactorChallenge();
      router.replace(callbackUrl);
      return;
    }

    setResult(actionResult);

    if (actionResult.status === "codeInvalid" && actionResult.attemptsLeft === undefined) {
      clearTwoFactorChallenge();
      router.replace("/login");
    }
  };

  return (
    <AuthScreenLayout auroraTone={codeInvalid ? "danger-field" : "default"}>
      <AuthEyebrow>{t("auth.twoFactor.eyebrow")}</AuthEyebrow>
      <AuthTitle>{t("auth.backupCode.title")}</AuthTitle>
      <AuthDescription>{t("auth.backupCode.subtitle")}</AuthDescription>

      <form
        className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]"
        data-testid="backup-code-form"
        noValidate
        onSubmit={onSubmit}
      >
        <AuthLevelTwoBanner result={result} />

        <TextInput
          autoCapitalize="characters"
          autoComplete="one-time-code"
          data-testid="backup-code-input"
          error={codeInvalid ? t("auth.status.codeInvalid.title") : undefined}
          label={t("auth.field.backupCode")}
          onChange={(event) => setValue(formatBackupCode(event.target.value))}
          placeholder={t("auth.field.backupCodePlaceholder")}
          fieldSize="code"
          spellCheck={false}
          value={value}
        />

        <PrimaryButton
          disabled={value.length === 0 || submitting}
          loading={submitting}
          type="submit"
        >
          {t("auth.twoFactor.cta")}
        </PrimaryButton>
      </form>

      <div className="mt-[var(--auth-title-gap)] flex justify-center">
        <AuthLink href="/login" onClick={() => clearTwoFactorChallenge()} size="small" tone="muted">
          {t("auth.common.backToLogin")}
        </AuthLink>
      </div>
    </AuthScreenLayout>
  );
}
