import type { CSSProperties } from "react";

import { AUTH_METRICS } from "@/lib/auth/metrics";

/**
 * SPEC-GIRIS-KAYIT §3.1 — aurora katmanı.
 *
 * Pencere **kökünün ilk çocuğu** olarak durur, kolonların arkasında kalır ve ayırıcıyı geçer
 * (kabul kriteri 1). Kolonlar opak zemin almaz; bu yüzden `.auth-brand` ve `.auth-form-column`
 * yalnız `z-index` ile öne gelir, arkaplan boyamaz.
 *
 * Ton, ekranın durumuna göre iki radyalin opaklığını ve rengini değiştirir (SPEC §3.1 son madde,
 * §4.7). Renk yine `hsl(var(--token))`; burada yalnız hangi tokenın okunacağı seçilir.
 */

export type AuthAuroraTone =
  "danger-banner" | "danger-block" | "danger-field" | "default" | "success" | "success-final";

const TONE_VARS: Record<AuthAuroraTone, CSSProperties> = {
  default: {},
  "danger-field": {
    "--auth-aurora-b-tone": "var(--danger)",
    "--auth-aurora-b-alpha": String(AUTH_METRICS.aurora.tone.dangerField.second),
  } as CSSProperties,
  "danger-banner": {
    "--auth-aurora-b-tone": "var(--danger)",
    "--auth-aurora-b-alpha": String(AUTH_METRICS.aurora.tone.dangerBanner.second),
  } as CSSProperties,
  "danger-block": {
    "--auth-aurora-a-tone": "var(--danger)",
    "--auth-aurora-a-alpha": String(AUTH_METRICS.aurora.tone.dangerBlock.first),
    "--auth-aurora-b-tone": "var(--foreground)",
    "--auth-aurora-b-alpha": String(AUTH_METRICS.aurora.tone.dangerBlock.second),
  } as CSSProperties,
  success: {
    "--auth-aurora-b-alpha": String(AUTH_METRICS.aurora.tone.success.second),
  } as CSSProperties,
  "success-final": {
    "--auth-aurora-a-tone": "var(--success)",
    "--auth-aurora-a-alpha": String(AUTH_METRICS.aurora.tone.successFinal.first),
    "--auth-aurora-b-tone": "var(--primary)",
    "--auth-aurora-b-alpha": String(AUTH_METRICS.aurora.tone.successFinal.second),
  } as CSSProperties,
};

export function AuthAurora({ tone = "default" }: { tone?: AuthAuroraTone }) {
  return (
    <div aria-hidden="true" className="auth-aurora" data-tone={tone} style={TONE_VARS[tone]} />
  );
}
