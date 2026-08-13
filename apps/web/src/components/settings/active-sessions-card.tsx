"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthSession } from "@wizards/types";
import { Laptop, MonitorSmartphone, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { signOut } from "next-auth/react";

import { Badge } from "@/components/ui/badge";
import {
  authSessionQueryKey,
  fetchAuthSessions,
  revokeAuthSessionClient,
  revokeOtherAuthSessionsClient,
} from "@/lib/auth/auth-sessions-client";

type Translate = (key: string, values?: Record<string, number | string>) => string;

function deviceLabel(session: AuthSession, t: Translate) {
  const client = t(`settings.account.security.sessions.client.${session.clientType}`);
  return session.os ? `${client} · ${session.os}` : client;
}

function DeviceIcon({ session }: { session: AuthSession }) {
  const className = "h-4 w-4";
  if (session.deviceType === "MOBILE") return <Smartphone className={className} />;
  if (session.deviceType === "TABLET") return <Tablet className={className} />;
  if (session.clientType === "DESKTOP") return <Laptop className={className} />;
  return <MonitorSmartphone className={className} />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function ActiveSessionsCard({ t }: { t: Translate }) {
  const queryClient = useQueryClient();
  const [confirmTarget, setConfirmTarget] = useState<"others" | string | null>(null);
  const sessionsQuery = useQuery({
    queryFn: fetchAuthSessions,
    queryKey: authSessionQueryKey,
    staleTime: 30_000,
  });
  const revokeOne = useMutation({
    mutationFn: revokeAuthSessionClient,
    onSuccess: async (response) => {
      setConfirmTarget(null);
      if (response.currentSessionRevoked) {
        await signOut({ redirectTo: "/login" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
    },
  });
  const revokeOthers = useMutation({
    mutationFn: revokeOtherAuthSessionsClient,
    onSuccess: async () => {
      setConfirmTarget(null);
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
    },
  });
  const sessions = sessionsQuery.data?.sessions ?? [];
  const otherCount = sessions.filter(({ current }) => !current).length;
  const pending = revokeOne.isPending || revokeOthers.isPending;

  return (
    <section
      className="rounded-[20px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] p-3 shadow-[0_12px_32px_hsl(var(--shadow-color)/0.05)] sm:p-4"
      data-testid="active-sessions-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
            <MonitorSmartphone className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-app-foreground">
              {t("settings.account.security.sessions.title")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-app-muted">
              {t("settings.account.security.sessions.description")}
            </p>
          </div>
        </div>
        <button
          aria-label={t("settings.account.security.sessions.refresh")}
          className="rounded-lg p-2 text-app-muted transition hover:bg-[hsl(var(--surface-soft))] hover:text-app-foreground disabled:opacity-50"
          disabled={sessionsQuery.isFetching}
          onClick={() => void sessionsQuery.refetch()}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${sessionsQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-3 space-y-2" aria-live="polite">
        {sessionsQuery.isPending ? (
          <p className="rounded-xl bg-[hsl(var(--background)/0.46)] px-3 py-4 text-xs text-app-muted">
            {t("settings.account.security.sessions.loading")}
          </p>
        ) : sessionsQuery.isError ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-3">
            <p className="text-xs font-semibold text-rose-600">
              {t("settings.account.security.sessions.error")}
            </p>
            <button
              className="mt-2 text-xs font-bold text-[hsl(var(--primary))]"
              onClick={() => void sessionsQuery.refetch()}
              type="button"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <p className="rounded-xl bg-[hsl(var(--background)/0.46)] px-3 py-4 text-xs text-app-muted">
            {t("settings.account.security.sessions.empty")}
          </p>
        ) : (
          sessions.map((session) => (
            <article
              className={`rounded-[16px] border p-3 ${session.current ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.06)]" : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--background)/0.46)]"}`}
              key={session.id}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--surface-soft))] text-app-muted">
                  <DeviceIcon session={session} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-xs font-extrabold text-app-foreground">
                      {deviceLabel(session, t)}
                    </p>
                    {session.current ? (
                      <Badge>{t("settings.account.security.sessions.current")}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-app-muted">
                    {[session.browser, session.countryCode].filter(Boolean).join(" · ") ||
                      t("settings.account.security.sessions.unknown")}
                  </p>
                  <p className="mt-1 text-[11px] text-app-soft">
                    {t("settings.account.security.sessions.lastSeen", {
                      date: formatDate(session.lastSeenAt),
                    })}
                  </p>
                </div>
                <button
                  className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-50"
                  disabled={pending}
                  onClick={() => setConfirmTarget(session.id)}
                  type="button"
                >
                  {t("settings.account.security.sessions.revoke")}
                </button>
              </div>
              {confirmTarget === session.id ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--border)/0.55)] pt-3">
                  <p className="text-[11px] font-semibold text-rose-600">
                    {session.current
                      ? t("settings.account.security.sessions.confirmCurrent")
                      : t("settings.account.security.sessions.confirmOne")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="px-2 py-1 text-[11px] font-bold text-app-muted"
                      onClick={() => setConfirmTarget(null)}
                      type="button"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
                      disabled={pending}
                      onClick={() => revokeOne.mutate(session.id)}
                      type="button"
                    >
                      {t("common.confirm")}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      {otherCount > 0 ? (
        <div className="mt-3 border-t border-[hsl(var(--border)/0.55)] pt-3">
          {confirmTarget === "others" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-rose-600">
                {t("settings.account.security.sessions.confirmOthers", { count: otherCount })}
              </p>
              <div className="flex gap-2">
                <button
                  className="px-2 py-1 text-[11px] font-bold text-app-muted"
                  onClick={() => setConfirmTarget(null)}
                  type="button"
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
                  disabled={pending}
                  onClick={() => revokeOthers.mutate()}
                  type="button"
                >
                  {t("common.confirm")}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full rounded-xl border border-rose-500/25 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-500/10"
              disabled={pending}
              onClick={() => setConfirmTarget("others")}
              type="button"
            >
              {t("settings.account.security.sessions.revokeOthers")}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
