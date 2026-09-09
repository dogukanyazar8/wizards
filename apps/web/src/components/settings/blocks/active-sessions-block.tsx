"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Monitor, Smartphone, X } from "lucide-react";
import type { AccountSession } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import {
  fetchAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
} from "@/lib/settings/security-client";

/**
 * Aktif oturumlar (`o1`) — SPEC-AYARLAR §5.1, tuzak #13.
 *
 * `Bu cihaz` satırında **kapat düğmesi yok**: mevcut oturumu bu listeden kapatmak, kullanıcıyı
 * kendi ayarlar penceresinden atmak demek. Aynı satırın altındaki `Diğerlerini kapat` da mevcut
 * oturumu kapatmaz — `revoke-others` hedef kümesini `id != currentSessionId` ile kuruyor
 * (Ş3 §1.2), yani teklik sunucuda garanti; ekran onu tekrar etmez, ona güvenir.
 *
 * Liste durumu **bloğun dışında** yaşıyor: `o2` satırının iki düğmesi (`Listeyi yenile`,
 * `Diğerlerini kapat`) satır motorunda çizilir ve aynı listeyi tazeler. İki ayrı durum kopyası,
 * "yeniledim ama liste değişmedi" demekti.
 */

const { sessions: sessionMetrics } = SETTINGS_METRICS.blocks;

export type AccountSessionsValue = {
  readonly failed: boolean;
  readonly pending: boolean;
  readonly refresh: () => void;
  readonly revoke: (sessionId: string) => void;
  readonly revokeOthers: () => void;
  readonly sessions: readonly AccountSession[] | null;
};

const IDLE_SESSIONS: AccountSessionsValue = {
  failed: false,
  pending: false,
  refresh: () => {},
  revoke: () => {},
  revokeOthers: () => {},
  sessions: null,
};

const AccountSessionsContext = createContext<AccountSessionsValue>(IDLE_SESSIONS);

export function useAccountSessions(): AccountSessionsValue {
  return useContext(AccountSessionsContext);
}

export function useAccountSessionsState(): AccountSessionsValue {
  const [sessions, setSessions] = useState<readonly AccountSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  /**
   * Yeniden okuma bir **sayaçla** tetiklenir.
   *
   * Efektin gövdesinde `setState` çağırmak (yükleniyor bayrağını kaldırmak için) React'in
   * "efekt içinde senkron setState" kuralını çiğniyor ve zincirleme render üretiyor; sayaç
   * efektin dışında, kullanıcının dokunuşuyla artıyor ve durum yalnız **yanıt geldiğinde**
   * değişiyor.
   */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    fetchAccountSessions()
      .then((next) => {
        if (!active) return;

        setSessions(next);
        setFailed(false);
        setPending(false);
      })
      .catch(() => {
        if (!active) return;

        setFailed(true);
        setPending(false);
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setPending(true);
    setReloadToken((token) => token + 1);
  }, []);

  return useMemo(
    () => ({
      failed,
      pending,
      refresh: reload,
      revoke: (sessionId: string) => {
        setPending(true);
        void revokeAccountSession(sessionId)
          .then(reload)
          .catch(() => {
            setFailed(true);
            setPending(false);
          });
      },
      revokeOthers: () => {
        setPending(true);
        void revokeOtherAccountSessions()
          .then(reload)
          .catch(() => {
            setFailed(true);
            setPending(false);
          });
      },
      sessions,
    }),
    [failed, pending, reload, sessions],
  );
}

export function AccountSessionsProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: AccountSessionsValue;
}) {
  return (
    <AccountSessionsContext.Provider value={value}>{children}</AccountSessionsContext.Provider>
  );
}

export function ActiveSessionsBlock({ row: rowDef }: SettingsBlockProps) {
  const { locale, t } = useI18n();
  const { failed, pending, revoke, sessions } = useAccountSessions();

  if (failed) {
    return (
      <p
        data-block="sessions"
        data-testid={`settings-block-${rowDef.key}-error`}
        style={{
          color: "hsl(var(--text-muted))",
          fontSize: pxToRem(11.5),
          lineHeight: 1.45,
          padding: `${pxToRem(sessionMetrics.rowPaddingY)} ${pxToRem(sessionMetrics.rowPaddingX)}`,
        }}
      >
        {t("settings.block.sessions.error")}
      </p>
    );
  }

  if (sessions === null) {
    return (
      <div
        aria-busy="true"
        aria-label={t("settings.control.block.loading")}
        className="motion-safe:animate-pulse"
        data-block="sessions"
        data-testid={`settings-block-${rowDef.key}-skeleton`}
        role="status"
        style={{
          background: `hsl(var(--surface-soft) / ${SETTINGS_METRICS.body.skeletonSurfaceAlpha})`,
          height: pxToRem(SETTINGS_METRICS.body.skeletonHeights[1] ?? 150),
        }}
      />
    );
  }

  if (sessions.length === 0) {
    return (
      <p
        data-block="sessions"
        data-testid={`settings-block-${rowDef.key}-empty`}
        style={{
          color: "hsl(var(--text-muted))",
          fontSize: pxToRem(11.5),
          lineHeight: 1.45,
          padding: `${pxToRem(sessionMetrics.rowPaddingY)} ${pxToRem(sessionMetrics.rowPaddingX)}`,
        }}
      >
        {t("settings.block.sessions.empty")}
      </p>
    );
  }

  return (
    <ul data-block="sessions" data-testid={`settings-block-${rowDef.key}`}>
      {sessions.map((session, index) => {
        const PlatformIcon = session.platform === "mobile" ? Smartphone : Monitor;
        const detail = [
          session.os,
          session.location,
          new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(session.lastActive),
          ),
        ]
          .filter((part): part is string => Boolean(part))
          .join(" · ");

        return (
          <li
            className="flex items-center"
            data-testid={`settings-session-${session.id}`}
            key={session.id}
            style={{
              background: session.current
                ? `hsl(var(--success) / ${sessionMetrics.currentSurfaceAlpha})`
                : "transparent",
              borderTop: index
                ? `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`
                : undefined,
              gap: pxToRem(sessionMetrics.rowGap),
              padding: `${pxToRem(sessionMetrics.rowPaddingY)} ${pxToRem(
                sessionMetrics.rowPaddingX,
              )}`,
            }}
          >
            <span
              aria-hidden="true"
              className="grid shrink-0 place-items-center"
              style={{
                background: "hsl(var(--surface-soft))",
                borderRadius: pxToRem(sessionMetrics.iconRadius),
                color: "hsl(var(--text-secondary))",
                height: pxToRem(sessionMetrics.iconSize),
                width: pxToRem(sessionMetrics.iconSize),
              }}
            >
              <PlatformIcon style={{ height: pxToRem(15), width: pxToRem(15) }} />
            </span>
            <span className="block min-w-0 flex-1">
              <span className="flex items-center" style={{ gap: pxToRem(8) }}>
                <span
                  className="whitespace-nowrap"
                  style={{
                    color: "hsl(var(--foreground))",
                    fontSize: pxToRem(12.5),
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  {`${session.device} · ${t(`settings.block.sessions.platform.${session.platform}`)}`}
                </span>
                {session.current ? (
                  <span
                    className="rounded-full"
                    data-testid={`settings-session-${session.id}-current`}
                    style={{
                      background: "hsl(var(--success) / 0.16)",
                      color: "var(--success-readable)",
                      fontSize: pxToRem(9.5),
                      fontWeight: 600,
                      lineHeight: 1.5,
                      padding: `${pxToRem(2)} ${pxToRem(7)}`,
                    }}
                  >
                    {t("settings.block.sessions.current")}
                  </span>
                ) : null}
              </span>
              <span
                className="block truncate"
                style={{
                  color: "hsl(var(--text-muted))",
                  fontSize: pxToRem(11),
                  lineHeight: 1.4,
                  marginTop: pxToRem(4),
                }}
              >
                {detail}
              </span>
            </span>
            {/* Tuzak #13 — `Bu cihaz` satırında kapat düğmesi **yok**. */}
            {session.current ? null : (
              <button
                aria-label={t("settings.block.sessions.close")}
                className="grid shrink-0 place-items-center transition-colors disabled:cursor-not-allowed disabled:opacity-55"
                data-testid={`settings-session-${session.id}-close`}
                disabled={pending}
                onClick={() => revoke(session.id)}
                style={{
                  background: "transparent",
                  border: `${hairline()} solid hsl(var(--border) / 0.7)`,
                  borderRadius: pxToRem(sessionMetrics.closeRadius),
                  color: "hsl(var(--text-muted))",
                  height: pxToRem(sessionMetrics.closeSize),
                  width: pxToRem(sessionMetrics.closeSize),
                }}
                title={t("settings.block.sessions.close")}
                type="button"
              >
                <X aria-hidden="true" style={{ height: pxToRem(14), width: pxToRem(14) }} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
