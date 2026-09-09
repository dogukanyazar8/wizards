"use client";

import React, { useState } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  RiskyButton,
  RiskyField,
  RiskyFooter,
  RiskyGrid,
  RiskyMessage,
} from "@/components/settings/risky/risky-field";
import { SecurityClientError, changePassword } from "@/lib/settings/security-client";

/**
 * Parola bloğu (`apw`) — SPEC-AYARLAR §5.1, Ş7 §2.
 *
 * Üç hata dalı **ayrı** cümlelerdir, çünkü sunucu da onları ayrı kodlarla döndürüyor (Ş3 §1.1):
 * `INVALID_CURRENT_PASSWORD` · `PASSWORD_MISMATCH` · `WEAK_PASSWORD`. Zayıf parola tek bir cümle
 * değil, **düşen kuralların listesi**: "parolan yeterince güçlü değil" diyen bir uyarı,
 * kullanıcıya neyi değiştireceğini söylemez.
 *
 * Yardım metni referansın kendisidir: `En az 10 karakter, bir sayı ve bir büyük harf gerekir.`
 */

const RULE_KEY: Readonly<Record<string, string>> = {
  digit: "settings.security.password.rule.digit",
  length: "settings.security.password.rule.length",
  maxLength: "settings.security.password.rule.maxLength",
  reused: "settings.security.password.rule.reused",
  uppercase: "settings.security.password.rule.uppercase",
};

const ERROR_KEY: Readonly<Record<string, string>> = {
  INVALID_CURRENT_PASSWORD: "settings.security.password.error.invalidCurrent",
  PASSWORD_MISMATCH: "settings.security.password.error.mismatch",
  WEAK_PASSWORD: "settings.security.password.error.weak",
};

export type PasswordBlockProps = {
  readonly onClose: () => void;
};

export function PasswordBlock({ onClose }: PasswordBlockProps) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ key: string; rules: readonly string[] } | null>(null);
  const [done, setDone] = useState(false);

  const submit = () => {
    if (pending) return;

    setPending(true);
    setError(null);
    setDone(false);

    changePassword({ confirmPassword: confirm, currentPassword: current, newPassword: next })
      .then(() => {
        setDone(true);
        setCurrent("");
        setNext("");
        setConfirm("");
      })
      .catch((cause: unknown) => {
        const failure = cause instanceof SecurityClientError ? cause : null;

        setError({
          key: ERROR_KEY[failure?.code ?? ""] ?? "settings.security.password.error.unavailable",
          rules: failure?.failedRules ?? [],
        });
      })
      .finally(() => setPending(false));
  };

  return (
    <RiskyGrid>
      <RiskyField
        autoComplete="current-password"
        label={t("settings.block.password.current")}
        onChange={setCurrent}
        span="full"
        testId="settings-password-current"
        type="password"
        value={current}
      />
      <RiskyField
        autoComplete="new-password"
        label={t("settings.block.password.next")}
        onChange={setNext}
        testId="settings-password-next"
        type="password"
        value={next}
      />
      <RiskyField
        autoComplete="new-password"
        invalid={confirm.length > 0 && confirm !== next}
        label={t("settings.block.password.confirm")}
        onChange={setConfirm}
        testId="settings-password-confirm"
        type="password"
        value={confirm}
      />

      {error ? (
        <RiskyMessage
          testId="settings-password-error"
          text={[t(error.key), ...error.rules.map((rule) => t(RULE_KEY[rule] ?? rule))].join(" ")}
          tone="danger"
        />
      ) : null}
      {done ? (
        <RiskyMessage
          testId="settings-password-done"
          text={t("settings.security.password.success")}
          tone="success"
        />
      ) : null}

      <RiskyFooter help={t("settings.block.password.help")}>
        <RiskyButton
          label={t("settings.block.password.cancel")}
          onClick={onClose}
          testId="settings-password-cancel"
        />
        <RiskyButton
          disabled={pending || !current || !next || !confirm}
          label={t("settings.block.password.submit")}
          onClick={submit}
          testId="settings-password-submit"
          tone="primary"
        />
      </RiskyFooter>
    </RiskyGrid>
  );
}
