"use client";

import { Hash, Volume2 } from "lucide-react";
import type { WorkspaceChannel } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";

type MainChannelPanelProps = {
  categoryName?: string | null;
  channel?: WorkspaceChannel | null;
  children?: React.ReactNode;
  fallbackTitle: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

export function MainChannelPanel({
  categoryName,
  channel,
  children,
  fallbackTitle,
  leading,
  trailing,
}: MainChannelPanelProps) {
  const { t } = useI18n();
  const Icon = channel?.type === "VOICE" ? Volume2 : Hash;
  const title = channel ? `#${channel.name}` : fallbackTitle;
  const contextLabel = categoryName
    ? categoryName
    : channel
      ? t("shell.main.openConversation")
      : t("shell.main.workspaceOverview");
  const detailLabel = channel
    ? t("shell.main.channelType", {
        type: channel.type === "VOICE" ? t("common.voice") : t("common.text"),
      })
    : t("shell.main.pickServerOrChannel");

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
                  {detailLabel}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-app-muted">{contextLabel}</span>
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

      {children ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-3xl">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <div className="rounded-[34px] border border-[hsl(var(--border)/0.78)] bg-[linear-gradient(150deg,hsl(var(--surface-card)/0.88),hsl(var(--surface-soft)/0.42))] p-8 shadow-[0_28px_70px_hsl(var(--shadow-color)/0.08)]">
                <div className="app-panel-soft text-app-foreground flex h-20 w-20 items-center justify-center rounded-[28px] border shadow-[0_24px_52px_hsl(var(--shadow-color)/0.12)]">
                  <Icon className="h-8 w-8" />
                </div>
                <h2 className="text-app-foreground mt-6 text-3xl font-semibold tracking-tight">
                  {channel ? t("shell.main.welcomeToChannel", { name: channel.name }) : fallbackTitle}
                </h2>
                <p className="text-app-muted mt-3 text-sm leading-7">
                  {t("shell.main.selectChannelDescription")}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {[
                    t("shell.main.fastSwitching"),
                    t("shell.main.cleanerHierarchy"),
                    t("shell.main.multiUserReady"),
                  ].map(
                    (item) => (
                      <span
                        className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.44)] px-3 py-1.5 text-xs font-medium text-app-foreground"
                        key={item}
                      >
                        {item}
                      </span>
                    ),
                  )}
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
                    <p className="text-app-foreground text-sm font-semibold">
                      {cardTitle}
                    </p>
                    <p className="text-app-muted mt-2 text-sm leading-6">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
