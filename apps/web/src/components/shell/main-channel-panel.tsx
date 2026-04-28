"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Hash, Volume2 } from "lucide-react";
import type { WorkspaceChannel } from "@wizards/types";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/components/providers/locale-provider";
import { useAppStore } from "@/lib/store";

type MainChannelPanelProps = {
  categoryName?: string | null;
  channel?: WorkspaceChannel | null;
  children?: React.ReactNode;
  contextLabel?: string | undefined;
  detailLabel?: string | undefined;
  fallbackTitle: string;
  icon?: LucideIcon | undefined;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

function WorkspaceSignature() {
  const { locale, t } = useI18n();

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
      }).format(new Date()),
    [locale],
  );

  return (
    <div className="flex justify-center px-4 pb-4 pt-1">
      <div className="app-panel-soft inline-flex flex-wrap items-center justify-center gap-2 rounded-full border px-4 py-2 text-[11px] font-medium text-app-muted shadow-[0_14px_32px_hsl(var(--shadow-color)/0.08)]">
        <span className="text-app-foreground">{t("shell.footer.builtWith")}</span>
        <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-[hsl(var(--primary))]">
          AI
        </span>
        <span>{t("shell.footer.codex")}</span>
        <span className="text-app-soft">/</span>
        <span>{todayLabel}</span>
      </div>
    </div>
  );
}

function EmptyChannelState({
  channel,
  fallbackTitle,
  icon: Icon,
}: {
  channel?: WorkspaceChannel | null | undefined;
  fallbackTitle: string;
  icon: LucideIcon;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-1 items-center justify-center p-6 md:p-8">
      <div className="grid w-full max-w-4xl gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="rounded-[34px] border border-[hsl(var(--border)/0.72)] bg-[linear-gradient(155deg,hsl(var(--surface-card)/0.88),hsl(var(--surface-soft)/0.38))] p-8 shadow-[0_30px_70px_hsl(var(--shadow-color)/0.08)]">
          <div className="app-panel-soft text-app-foreground flex h-20 w-20 items-center justify-center rounded-[28px] border shadow-[0_24px_52px_hsl(var(--shadow-color)/0.12)]">
            <Icon className="h-8 w-8" />
          </div>
          <h2 className="text-app-foreground mt-6 text-3xl font-semibold tracking-tight">
            {channel ? t("shell.main.welcomeToChannel", { name: channel.name }) : fallbackTitle}
          </h2>
          <p className="text-app-muted mt-3 max-w-2xl text-sm leading-7">
            {t("shell.main.selectChannelDescription")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              t("shell.main.fastSwitching"),
              t("shell.main.cleanerHierarchy"),
              t("shell.main.multiUserReady"),
            ].map((item) => (
              <span
                className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.44)] px-3 py-1.5 text-xs font-medium text-app-foreground"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {[
            [
              t("shell.main.browseServersTitle"),
              t("shell.main.browseServersDescription"),
            ],
            [
              t("shell.main.tuneLayoutTitle"),
              t("shell.main.tuneLayoutDescription"),
            ],
            [
              t("shell.main.startTalkingTitle"),
              t("shell.main.startTalkingDescription"),
            ],
          ].map(([cardTitle, description]) => (
            <div
              className="app-panel rounded-[28px] border p-5 shadow-[0_16px_36px_hsl(var(--shadow-color)/0.06)]"
              key={cardTitle}
            >
              <p className="text-app-foreground text-sm font-semibold">{cardTitle}</p>
              <p className="text-app-muted mt-2 text-sm leading-6">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MainChannelPanel({
  categoryName,
  channel,
  children,
  contextLabel,
  detailLabel,
  fallbackTitle,
  icon,
  leading,
  trailing,
}: MainChannelPanelProps) {
  const { t } = useI18n();
  const { mainPanelWidth } = useAppStore(
    useShallow((state) => ({
      mainPanelWidth: state.mainPanelWidth,
    })),
  );
  const Icon = icon ?? (channel?.type === "VOICE" ? Volume2 : Hash);
  const title = channel ? `#${channel.name}` : fallbackTitle;
  const resolvedContextLabel =
    contextLabel ??
    (categoryName
      ? categoryName
      : channel
        ? t("shell.main.openConversation")
        : t("shell.main.workspaceOverview"));
  const resolvedDetailLabel =
    detailLabel ??
    (channel
      ? t("shell.main.channelType", {
          type: channel.type === "VOICE" ? t("common.voice") : t("common.text"),
        })
      : t("shell.main.pickServerOrChannel"));

  return (
    <section className="app-main-gradient flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-[hsl(var(--border)/0.78)] px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {leading}
            <div className="app-panel-soft text-app-foreground flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border shadow-[0_18px_40px_hsl(var(--shadow-color)/0.08)]">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="text-app-foreground truncate text-sm font-semibold md:text-base">
                  {title}
                </h1>
                <span className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.52)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft">
                  {resolvedDetailLabel}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-app-muted">{resolvedContextLabel}</span>
                <span className="text-app-soft">/</span>
                <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 font-medium text-[hsl(var(--primary))]">
                  {t("shell.main.liveWorkspace")}
                </span>
              </div>
            </div>
          </div>
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3 pt-3 md:px-6 md:pb-4 md:pt-4">
        <div
          className="mx-auto flex min-h-0 w-full flex-1 overflow-hidden rounded-[34px] border border-[hsl(var(--border)/0.76)] bg-[linear-gradient(160deg,hsl(var(--surface-card)/0.88),hsl(var(--surface-soft)/0.28))] shadow-[0_32px_80px_hsl(var(--shadow-color)/0.09)]"
          data-main-panel-frame="true"
          style={{ maxWidth: `${mainPanelWidth}px` }}
        >
          {children ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          ) : (
            <EmptyChannelState channel={channel} fallbackTitle={fallbackTitle} icon={Icon} />
          )}
        </div>
      </div>

      <WorkspaceSignature />
    </section>
  );
}
