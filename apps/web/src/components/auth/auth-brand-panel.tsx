"use client";

import type { CSSProperties } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { useI18n } from "@/components/providers/locale-provider";

/**
 * SPEC-GIRIS-KAYIT §3.3 — marka paneli.
 *
 * Tüm web ekranlarında aynı bileşen; masaüstünde yalnız ölçek kademesi değişir (SPEC §5) ve o da
 * kökteki CSS değişkenlerinden gelir, buradan değil.
 *
 * `interactive={false}` **zorunlu**: aksi hâlde `BrandLogo` kendini `<a href="/login">` olarak
 * çizer ve giriş ekranı kendine link veren bir logo taşır (SPEC §2).
 */

const POINT_TONES: CSSProperties[] = [
  { "--auth-point-tone": "var(--primary)" } as CSSProperties,
  { "--auth-point-tone": "var(--success)" } as CSSProperties,
];

export function AuthBrandPanel() {
  const { t } = useI18n();

  return (
    <aside className="auth-brand">
      <div className="auth-brand-mark">
        <BrandLogo animated interactive={false} />
      </div>

      <p className="auth-brand-wordmark">Whispr</p>
      <p className="auth-brand-tagline">{t("auth.brand.tagline")}</p>

      <div aria-hidden="true" className="auth-brand-divider" />

      <h2 className="auth-brand-heading">{t("auth.brand.heading")}</h2>
      <p className="auth-brand-body">{t("auth.brand.body")}</p>

      <ul className="auth-brand-points">
        <li className="auth-brand-point" style={POINT_TONES[0]}>
          {t("auth.brand.point1")}
        </li>
        <li className="auth-brand-point" style={POINT_TONES[1]}>
          {t("auth.brand.point2")}
        </li>
      </ul>
    </aside>
  );
}
