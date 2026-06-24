"use client";

import type { LucideIcon } from "lucide-react";
import { Hash, Volume2 } from "lucide-react";
import type { WorkspaceChannel } from "@wizards/types";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/components/providers/locale-provider";
import { useAppStore } from "@/lib/store";

type MainChannelPanelProps = {
  channel?: WorkspaceChannel | null;
  children?: React.ReactNode;
  fallbackTitle: string;
  icon?: LucideIcon | undefined;
  leading?: React.ReactNode;
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
            [t("shell.main.browseServersTitle"), t("shell.main.browseServersDescription")],
            [t("shell.main.tuneLayoutTitle"), t("shell.main.tuneLayoutDescription")],
            [t("shell.main.startTalkingTitle"), t("shell.main.startTalkingDescription")],
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
  channel,
  children,
  fallbackTitle,
  icon,
  leading,
}: MainChannelPanelProps) {
  const { mainPanelWidth } = useAppStore(
    useShallow((state) => ({
      mainPanelWidth: state.mainPanelWidth,
    })),
  );
  const Icon = icon ?? (channel?.type === "VOICE" ? Volume2 : Hash);

  return (
    <section className="app-main-gradient relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {leading ? (
        <div className="relative z-50 shrink-0 border-b border-[hsl(var(--border)/0.32)] bg-[hsl(var(--background)/0.76)] px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl md:hidden">
          {leading}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0 pt-0">
        <div
          className="whispr-surface-pane mx-auto flex min-h-0 w-full flex-1 overflow-hidden rounded-[18px] border-0 shadow-none"
          data-main-panel-frame="true"
          data-surface-layer="pane"
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
