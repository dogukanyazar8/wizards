"use client";

import type { ReactNode } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { AUTH_TONE_VARS } from "@/components/auth/auth-error-levels";
import { AUTH_STATUS_CATALOG, type AuthStatusId } from "@/lib/auth/status-catalog";

/**
 * SPEC-GIRIS-KAYIT §4.4/6, §4.7, §7 ve §9 küçük parçaları.
 *
 * Hepsi tek bir yerde: Turnstile satırı, öneri etiketi, geri sayım pill'i, başarı karosu,
 * ışıma halkası, bilgi bandı ve durum kartı kabuğu.
 */

/** SPEC §4.4/6 — doğrulanmadan önce nötr, doğrulanınca yeşil. */
export function AuthTurnstileRow({ verified }: { verified: boolean }) {
  const { t } = useI18n();

  return (
    <div className="auth-turnstile">
      <span
        aria-hidden="true"
        className="auth-turnstile-tile"
        data-state={verified ? "verified" : "pending"}
      >
        {verified ? "✓" : null}
      </span>
      <span className="auth-hint">{t("auth.register.turnstileTitle")}</span>
      <span className="auth-turnstile-hint">{t("auth.register.turnstileHint")}</span>
    </div>
  );
}

/** SPEC §7/4 ve §9 — kullanıcı adı öneri etiketi. */
export function AuthSuggestionChip({
  children,
  onSelect,
  selected,
}: {
  children: ReactNode;
  onSelect: () => void;
  selected?: boolean;
}) {
  return (
    <button aria-pressed={selected ?? false} className="auth-chip" onClick={onSelect} type="button">
      {selected ? <span aria-hidden="true">✓</span> : null}
      <span>{children}</span>
    </button>
  );
}

/**
 * SPEC §4.7 — `Yeniden gönderme 00:58 sonra açılır`.
 *
 * `white-space: nowrap` sözleşmenin parçası: sayaç sarılırsa pill iki satıra düşer ve
 * bağlantının yerini alan blok kayar.
 */
export function AuthCountdownPill({ children }: { children: ReactNode }) {
  return (
    <span className="auth-pill" role="status">
      {children}
    </span>
  );
}

/** SPEC §4.7 — 52×52 başarı karosu, sütunda yatay ortalı. */
export function AuthSuccessTile({ final }: { final?: boolean }) {
  return (
    <span aria-hidden="true" className="auth-success-tile" data-final={final ? "true" : undefined}>
      ✓
    </span>
  );
}

/** SPEC §4.7 kapanış ekranı — 76px ışıma halkası, içinde başarı karosu. */
export function AuthSuccessRing({ children }: { children: ReactNode }) {
  return <div className="auth-success-ring">{children}</div>;
}

/** SPEC §4.7 — `3 cihazda oturum kapatıldı · 27.08.2026 · 11:24`. */
export function AuthInfoBand({ children }: { children: ReactNode }) {
  return <p className="auth-info-band">{children}</p>;
}

/**
 * SPEC §7 — durum kartı kabuğu.
 *
 * Kart içi parçayı `children` alır; 10 durumun içeriklerini akışa bağlamak Ş9'un işi.
 */
export function AuthStatusCard({
  children,
  statusId,
}: {
  children?: ReactNode;
  statusId: AuthStatusId;
}) {
  const { t } = useI18n();
  const status = AUTH_STATUS_CATALOG[statusId];

  return (
    <article
      className="auth-status-card"
      data-status={statusId}
      data-tone={status.tone}
      style={AUTH_TONE_VARS[status.tone]}
    >
      <div className="flex items-center gap-[var(--auth-label-gap)]">
        <span aria-hidden="true" className="auth-status-tile">
          {status.glyph}
        </span>
        <span className="auth-status-label">{t(status.labelKey)}</span>
      </div>

      <h3 className="auth-status-title mt-[var(--auth-label-gap)]">{t(status.titleKey)}</h3>
      <p className="auth-status-body mt-[var(--auth-label-gap)]">{t(status.descriptionKey)}</p>

      {children ? <div className="mt-[var(--auth-title-gap)]">{children}</div> : null}
    </article>
  );
}
