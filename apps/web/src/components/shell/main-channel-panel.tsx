"use client";

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
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border)/0.78)] bg-[hsl(var(--background)/0.82)] px-3 py-3 backdrop-blur-2xl md:static md:bg-transparent md:px-6 md:py-4 md:backdrop-blur-none">
        <div className="flex items-center justify-between gap-3 md:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {leading}
            <div className="app-panel-soft text-app-foreground hidden h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border shadow-[0_18px_40px_hsl(var(--shadow-color)/0.08)] sm:flex">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="text-app-foreground truncate text-sm font-semibold md:text-base">
                  {title}
                </h1>
                <span className="hidden rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.52)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-soft sm:inline-flex">
                  {resolvedDetailLabel}
                </span>
              </div>
              <div className="mt-2 hidden flex-wrap items-center gap-2 text-xs sm:flex">
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0 pt-0 md:px-2 md:pb-2 md:pt-2">
        <div
          className="mx-auto flex min-h-0 w-full flex-1 overflow-hidden border-x-0 border-y border-[hsl(var(--border)/0.72)] bg-[linear-gradient(160deg,hsl(var(--surface-card)/0.9),hsl(var(--surface-soft)/0.22))] shadow-none md:rounded-[28px] md:border md:shadow-[0_24px_62px_hsl(var(--shadow-color)/0.075)]"
          data-main-panel-frame="true"
          style={{ maxWidth: children ? "100%" : `${mainPanelWidth}px` }}
        >
          {children ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          ) : (
            <EmptyChannelState channel={channel} fallbackTitle={fallbackTitle} icon={Icon} />
          )}
        </div>
      </div>

    </section>
  );
}
