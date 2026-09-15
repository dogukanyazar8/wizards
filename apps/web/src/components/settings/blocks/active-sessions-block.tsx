"use client";

import React, { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Monitor, MonitorSmartphone, Smartphone, Tablet, X } from "lucide-react";
import { useAccountSecurityRefresh } from "@/hooks/use-account-security-refresh";
import type { AccountSession } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import {
  fetchAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
  securityQueryKeys,
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

const SESSION_DEVICE_ICONS = {
  DESKTOP: Monitor,
  MOBILE: Smartphone,
  TABLET: Tablet,
  UNKNOWN: MonitorSmartphone,
} as const;

export type AccountSessionsValue = {
  readonly failed: boolean;
  readonly pending: boolean;
  readonly refresh: () => void;
  readonly revoke: (sessionId: string) => void;
  readonly revokeOthers: () => void | Promise<void>;
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

export function useAccountSessionsState(live = true): AccountSessionsValue {
  useAccountSecurityRefresh(live);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: securityQueryKeys.sessions,
    queryFn: ({ signal }) => fetchAccountSessions(fetch, signal),
    staleTime: 30_000,
    refetchInterval: live ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: securityQueryKeys.sessions }),
    [client],
  );
  const mutation = useMutation({
    mutationFn: async (sessionId: string | null) => {
      if (sessionId === null) await revokeOtherAccountSessions();
      else await revokeAccountSession(sessionId);
    },
    onSuccess: async (_result, sessionId) => {
      await client.cancelQueries({ queryKey: securityQueryKeys.sessions });
      client.setQueryData<readonly AccountSession[]>(securityQueryKeys.sessions, (previous) =>
        previous?.filter((session) =>
          sessionId === null ? session.current : session.id !== sessionId,
        ),
      );
      await Promise.all([
        refresh(),
        client.invalidateQueries({ queryKey: securityQueryKeys.events }),
      ]);
    },
  });
  const sessions = query.data ?? null;
  const failed = query.isError || mutation.isError;
  const pending = query.isPending || mutation.isPending;
  const mutateAsync = mutation.mutateAsync;

  return useMemo(
    () => ({
      failed,
      pending,
      refresh: () => {
        void refresh();
      },
      revoke: (sessionId: string) => {
        void mutateAsync(sessionId).catch(() => {
          /* Mutation error is rendered with the list. */
        });
      },
      revokeOthers: () => mutateAsync(null),
      sessions,
    }),
    [failed, pending, refresh, sessions, mutateAsync],
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

  if (failed && sessions === null) {
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
      {failed ? (
        <li role="alert" className="px-4 py-2 text-xs text-app-muted">
          {t("settings.block.sessions.error")}
        </li>
      ) : null}
      {sessions.map((session, index) => {
        // The icon describes this session's device, independent of the viewer or client type.
        const PlatformIcon = SESSION_DEVICE_ICONS[session.deviceType ?? "UNKNOWN"];
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
