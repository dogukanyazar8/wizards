"use client";

import {
  ArrowLeft,
  BellRing,
  ChevronDown,
  Info,
  Sparkles,
  UserRound,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import {
  buildSettingsHref,
  isAdvancedAppearancePanel,
  resolveSettingsSelection,
  type SettingsPanelKey,
  type SettingsSection,
} from "@/lib/settings/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  panel?: SettingsPanelKey;
  section: SettingsSection;
};

function SidebarItem({
  active,
  className,
  label,
  onClick,
}: {
  active?: boolean;
  className?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]",
        active
          ? "border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.12)] text-app-foreground shadow-[0_16px_30px_hsl(var(--shadow-color)/0.08)]"
          : "app-panel-soft text-app-muted hover:text-app-foreground",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full transition",
          active ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--border))]",
        )}
      />
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
}

export function SettingsSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { panel, section } = resolveSettingsSelection(searchParams);
  const [advancedOpen, setAdvancedOpen] = useState(
    section === "appearance" && isAdvancedAppearancePanel(panel),
  );

  useEffect(() => {
    if (section === "appearance" && isAdvancedAppearancePanel(panel)) {
      setAdvancedOpen(true);
    }
  }, [panel, section]);

  const goTo = (nextSection: SettingsSection, nextPanel?: SettingsPanelKey | null) => {
    router.push(buildSettingsHref(nextSection, nextPanel));
  };

  const voiceItems: NavItem[] = [
    { label: t("settings.voice.audio.title"), panel: "audio", section: "voice" },
    { label: t("settings.voice.camera.title"), panel: "camera", section: "voice" },
    {
      label: t("settings.voice.screenShare.title"),
      panel: "screenShare",
      section: "voice",
    },
  ];

  const appearanceItems: NavItem[] = [
    { label: t("settings.appearance.language.title"), panel: "language", section: "appearance" },
    { label: t("settings.appearance.theme.title"), panel: "theme", section: "appearance" },
  ];

  const notificationItems: NavItem[] = [
    { label: t("settings.notifications.general.title"), panel: "general", section: "notifications" },
    { label: t("settings.notifications.sounds.title"), panel: "sounds", section: "notifications" },
  ];

  const aboutItems: NavItem[] = [
    { label: t("common.overview"), panel: "overview", section: "about" },
    { label: t("settings.about.buildInfo.title"), panel: "build", section: "about" },
    { label: t("settings.about.developer.title"), panel: "developer", section: "about" },
  ];

  return (
    <aside className="app-panel h-fit rounded-[34px] border p-6 lg:sticky lg:top-6">
      <Link
        className="app-panel-soft text-app-foreground inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition hover:opacity-90"
        href="/channels"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("settings.backToChannels")}
      </Link>

      <div className="mt-8">
        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
          {t("common.settings")}
        </p>
        <h1 className="text-app-foreground mt-3 text-[2rem] font-semibold leading-tight">
          {t("settings.title")}
        </h1>
        <p className="text-app-muted mt-3 text-sm leading-7">{t("settings.description")}</p>
      </div>

      <nav className="mt-8 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]">
              <UserRound className="h-4 w-4" />
            </span>
            <p className="text-app-foreground text-sm font-semibold">
              {t("settings.account.title")}
            </p>
          </div>
          <SidebarItem
            active={section === "account"}
            label={t("settings.account.nav")}
            onClick={() => goTo("account")}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]">
              <Volume2 className="h-4 w-4" />
            </span>
            <p className="text-app-foreground text-sm font-semibold">
              {t("settings.groups.voiceVideo.title")}
            </p>
          </div>
          <SidebarItem
            active={section === "voice" && panel === null}
            label={t("settings.groups.voiceVideo.title")}
            onClick={() => goTo("voice")}
          />
          <div className="space-y-2 pl-4">
            {voiceItems.map((item) => (
              <SidebarItem
                active={section === item.section && panel === item.panel}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]">
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="text-app-foreground text-sm font-semibold">
              {t("settings.groups.appearance.title")}
            </p>
          </div>
          <SidebarItem
            active={section === "appearance" && panel === null}
            label={t("settings.groups.appearance.title")}
            onClick={() => goTo("appearance")}
          />
          <div className="space-y-2 pl-4">
            {appearanceItems.map((item) => (
              <SidebarItem
                active={section === item.section && panel === item.panel}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}

            <button
              className={cn(
                "app-panel-soft flex w-full items-center gap-3 rounded-[22px] border px-4 py-3 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.5)]",
                section === "appearance" && isAdvancedAppearancePanel(panel)
                  ? "border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.12)] text-app-foreground"
                  : "text-app-muted hover:text-app-foreground",
              )}
              onClick={() => {
                setAdvancedOpen((current) => !current);
                goTo("appearance", "advanced");
              }}
              type="button"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full transition",
                  section === "appearance" && isAdvancedAppearancePanel(panel)
                    ? "bg-[hsl(var(--primary))]"
                    : "bg-[hsl(var(--border))]",
                )}
              />
              <span className="min-w-0 flex-1">{t("settings.appearance.advanced.title")}</span>
              <ChevronDown
                className={cn("h-4 w-4 transition", advancedOpen ? "rotate-180" : "")}
              />
            </button>

            {advancedOpen ? (
              <div className="space-y-2 pl-4">
                <SidebarItem
                  active={section === "appearance" && panel === "serverRail"}
                  label={t("settings.appearance.advanced.serverRailTitle")}
                  onClick={() => goTo("appearance", "serverRail")}
                />
                <SidebarItem
                  active={section === "appearance" && panel === "mainCanvas"}
                  label={t("settings.appearance.advanced.mainCanvasTitle")}
                  onClick={() => goTo("appearance", "mainCanvas")}
                />
                <SidebarItem
                  active={section === "appearance" && panel === "channelSidebar"}
                  label={t("settings.appearance.advanced.channelSidebarTitle")}
                  onClick={() => goTo("appearance", "channelSidebar")}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]">
              <BellRing className="h-4 w-4" />
            </span>
            <p className="text-app-foreground text-sm font-semibold">
              {t("settings.groups.notifications.title")}
            </p>
          </div>
          <SidebarItem
            active={section === "notifications" && panel === null}
            label={t("settings.groups.notifications.title")}
            onClick={() => goTo("notifications")}
          />
          <div className="space-y-2 pl-4">
            {notificationItems.map((item) => (
              <SidebarItem
                active={section === item.section && panel === item.panel}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]">
              <Info className="h-4 w-4" />
            </span>
            <p className="text-app-foreground text-sm font-semibold">
              {t("settings.about.title")}
            </p>
          </div>
          <SidebarItem
            active={section === "about" && panel === null}
            label={t("settings.about.title")}
            onClick={() => goTo("about")}
          />
          <div className="space-y-2 pl-4">
            {aboutItems.map((item) => (
              <SidebarItem
                active={section === item.section && panel === item.panel}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}
          </div>
        </div>
      </nav>
    </aside>
  );
}
