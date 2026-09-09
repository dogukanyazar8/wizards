"use client";

import type { CSSProperties } from "react";

import { PASSWORD_RULE_IDS, type PasswordStrength } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";

/**
 * SPEC-GIRIS-KAYIT §4.4/4-5 — güç çubuğu ve 2×2 canlı kural listesi.
 *
 * Skoru **hesaplamaz**: `evaluatePasswordStrength` (paylaşılan sözleşme) sonucunu alır, böylece
 * istemcinin yeşil gösterdiği bir şifreyi sunucu reddedemez.
 *
 * Etiket rengi SPEC gereği tonun `-soft` hâlidir; doygun ton yalnız çubuğun dolgusunda.
 */

const TONE_VARS: Record<PasswordStrength["tone"], CSSProperties> = {
  danger: {
    "--auth-tone": "var(--danger)",
    "--auth-tone-soft": "var(--danger-soft)",
  } as CSSProperties,
  warning: {
    "--auth-tone": "var(--warning)",
    "--auth-tone-soft": "var(--warning-soft)",
  } as CSSProperties,
  success: {
    "--auth-tone": "var(--success)",
    "--auth-tone-soft": "var(--success-soft)",
  } as CSSProperties,
};

const SCORE_LABEL_KEYS = [
  "auth.password.veryWeak",
  "auth.password.weak",
  "auth.password.medium",
  "auth.password.good",
  "auth.password.strong",
] as const;

const RULE_LABEL_KEYS: Record<(typeof PASSWORD_RULE_IDS)[number], string> = {
  length: "auth.password.rule1",
  case: "auth.password.rule2",
  digit: "auth.password.rule3",
  symbol: "auth.password.rule4",
};

export function AuthPasswordStrength({ strength }: { strength: PasswordStrength }) {
  const { t } = useI18n();
  const percent = (strength.score / 4) * 100;

  return (
    <div style={TONE_VARS[strength.tone]}>
      <div className="auth-strength-track">
        <div className="auth-strength-fill" style={{ width: `${percent}%` }} />
      </div>

      <p aria-live="polite" className="auth-strength-label mt-[var(--auth-label-gap)]">
        {t("auth.password.strength")} · {t(SCORE_LABEL_KEYS[strength.score])}
      </p>

      <ul className="auth-strength-rules">
        {PASSWORD_RULE_IDS.map((ruleId) => {
          const met = strength.rules[ruleId];

          return (
            <li className="auth-strength-rule" data-met={met ? "true" : "false"} key={ruleId}>
              <span aria-hidden="true" className="auth-strength-dot">
                {met ? "✓" : null}
              </span>
              <span>{t(RULE_LABEL_KEYS[ruleId])}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
