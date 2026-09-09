"use client";

import type { CSSProperties, ReactNode } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { AUTH_STATUS_CATALOG, type AuthStatusId } from "@/lib/auth/status-catalog";

/**
 * SPEC-GIRIS-KAYIT §8 — hataların üç gösterim seviyesi.
 *
 * 1 · alan içi: `TextInput`'un kendi `error` desteği (bu dosyada değil).
 * 2 · form üstü bant: `AuthBanner`.
 * 3 · formu engelleyen blok: `AuthBlockingPanel`.
 *
 * Metin bileşenin içinde durmaz: kataloğun `*Key` alanları sözlüğe bakar (SPEC §12/9).
 */

export type AuthTone = "danger" | "neutral" | "success" | "warning";

export const AUTH_TONE_VARS: Record<AuthTone, CSSProperties> = {
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
  neutral: {
    "--auth-tone": "var(--surface-soft)",
    "--auth-tone-soft": "var(--text-secondary)",
  } as CSSProperties,
};

/**
 * SPEC §8/2 ve §4.7.
 *
 * Success varyantı **birebir aynı yapıdır**, yalnız ton değişir ve karo glifi `↻` olur — `✓`
 * değil, çünkü tik zaten ekranın üstünde duruyor ve ikinci bir tik anlamı bulanıklaştırır.
 */
export function AuthBanner({
  body,
  title,
  tone = "danger",
}: {
  body?: ReactNode;
  title: ReactNode;
  tone?: "danger" | "success" | "warning";
}) {
  return (
    <div className="auth-banner" data-tone={tone} role="alert" style={AUTH_TONE_VARS[tone]}>
      <span aria-hidden="true" className="auth-banner-tile">
        {tone === "success" ? "↻" : "!"}
      </span>
      <div>
        <p className="auth-banner-title">{title}</p>
        {body ? <p className="auth-banner-body">{body}</p> : null}
      </div>
    </div>
  );
}

/**
 * SPEC §8/3 — form tamamen gizlenir; yerine ikon karosu + etiket + başlık + açıklama +
 * durum bandı + tek birincil eylem gelir.
 */
export function AuthBlockingPanel({
  band,
  primaryAction,
  secondaryAction,
  statusId,
}: {
  band?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  statusId: AuthStatusId;
}) {
  const { t } = useI18n();
  const status = AUTH_STATUS_CATALOG[statusId];

  return (
    <section
      className="flex flex-col gap-[var(--auth-label-gap)]"
      role="alert"
      style={AUTH_TONE_VARS[status.tone]}
    >
      <span aria-hidden="true" className="auth-block-icon">
        {status.glyph}
      </span>
      <p className="auth-status-label">{t(status.labelKey)}</p>
      <h1 className="auth-block-title">{t(status.titleKey)}</h1>
      <p className="auth-description">{t(status.descriptionKey)}</p>
      {band ? <div className="auth-block-band">{band}</div> : null}
      {primaryAction}
      {secondaryAction}
    </section>
  );
}
