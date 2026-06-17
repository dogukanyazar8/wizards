"use client";

import {
  ArrowLeft,
  BellRing,
  ChevronDown,
  Code2,
  FileText,
  Headphones,
  ImageIcon,
  Info,
  Languages,
  LayoutDashboard,
  MonitorUp,
  Palette,
  PanelLeft,
  Search,
  Settings,
  Sidebar,
  Sparkles,
  Type,
  UserRound,
  Video,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import {
  buildSettingsHref,
  isAdvancedAppearancePanel,
  resolveSettingsSelection,
  type SettingsPanelKey,
  type SettingsSection as SettingsSectionKey,
} from "@/lib/settings/navigation";
import { cn } from "@/lib/utils";

type SettingsSidebarUser = {
  avatarUrl?: string | null;
  displayName: string;
  username: string;
};

type NavItem = {
  icon: LucideIcon;
  label: string;
  panel?: SettingsPanelKey;
  section: SettingsSectionKey;
};

type SettingsSidebarProps = {
  currentUser: SettingsSidebarUser;
};

function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.84)] shadow-[0_22px_60px_hsl(var(--shadow-color)/0.08)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SettingsSearch() {
  const { t } = useI18n();
  const searchId = useId();

  return (
    <label className="group relative block" htmlFor={searchId}>
      <span className="sr-only">{t("settings.search.placeholder")}</span>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft transition group-focus-within:text-[hsl(var(--primary))]" />
      <input
        aria-label={t("settings.search.placeholder")}
        className="h-12 w-full rounded-[18px] border border-[hsl(var(--border)/0.78)] bg-[hsl(var(--surface)/0.92)] pl-11 pr-16 text-sm font-medium text-app-foreground shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.68)] outline-none transition placeholder:text-app-soft focus:border-[hsl(var(--primary)/0.45)] focus:ring-4 focus:ring-[hsl(var(--primary)/0.12)]"
        id={searchId}
        placeholder={t("settings.search.placeholder")}
        type="search"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.72)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-app-soft sm:inline-flex">
        {t("settings.search.shortcut")}
      </span>
    </label>
  );
}

function SettingsNavItem({
  active,
  className,
  icon: Icon,
  label,
  nested = false,
  onClick,
}: {
  active?: boolean;
  className?: string;
  icon: LucideIcon;
  label: string;
  nested?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]",
        active
          ? "bg-[linear-gradient(90deg,hsl(var(--primary)/0.16),hsl(var(--primary)/0.08))] text-[hsl(var(--primary))] shadow-[0_16px_35px_hsl(var(--primary)/0.12)]"
          : nested
            ? "text-app-soft hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground"
            : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.82)] hover:text-app-foreground",
        nested ? "pl-5 text-[13px] font-medium" : "",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "absolute left-0 top-2 h-[calc(100%-1rem)] w-1 rounded-r-full transition",
          active ? "bg-[hsl(var(--primary))] opacity-100" : "bg-transparent opacity-0",
        )}
      />
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition",
          active
            ? "bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
            : "bg-[hsl(var(--surface-soft)/0.6)] text-app-soft group-hover:text-app-foreground",
          nested ? "h-7 w-7 rounded-lg" : "",
        )}
      >
        <Icon className={cn("h-4 w-4", nested ? "h-3.5 w-3.5" : "")} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function SettingsSection({
  children,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <section className="space-y-2.5" aria-label={label}>
      <div className="flex items-center gap-2 px-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-app-soft">
          {label}
        </p>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface)/0.72)] p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SettingsUserFooter({ user }: { user: SettingsSidebarUser }) {
  return (
    <SettingsRow className="mt-4 shrink-0 bg-[linear-gradient(135deg,hsl(var(--surface)/0.92),hsl(var(--surface-soft)/0.72))] shadow-[0_14px_34px_hsl(var(--shadow-color)/0.07)]">
      <div className="relative">
        <Avatar
          alt={user.displayName}
          className="h-10 w-10 border-[hsl(var(--primary)/0.2)]"
          fallback={user.displayName || user.username}
          src={user.avatarUrl}
        />
        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--surface))] bg-emerald-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-app-foreground">{user.displayName}</p>
        <p className="truncate text-xs font-medium text-app-soft">@{user.username}</p>
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-app-soft transition hover:bg-[hsl(var(--surface-soft))] hover:text-app-foreground">
        <Settings className="h-4 w-4" aria-hidden="true" />
      </span>
    </SettingsRow>
  );
}

export function SettingsSidebar({ currentUser }: SettingsSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { panel, section } = resolveSettingsSelection(searchParams);
  const [advancedOpen, setAdvancedOpen] = useState(true);

  useEffect(() => {
    if (section === "appearance" && isAdvancedAppearancePanel(panel)) {
      setAdvancedOpen(true);
    }
  }, [panel, section]);

  const goTo = (nextSection: SettingsSectionKey, nextPanel?: SettingsPanelKey | null) => {
    router.push(buildSettingsHref(nextSection, nextPanel));
  };

  const voiceItems: NavItem[] = [
    { icon: Volume2, label: t("settings.voice.audio.title"), panel: "audio", section: "voice" },
    { icon: Video, label: t("settings.voice.camera.title"), panel: "camera", section: "voice" },
    {
      icon: MonitorUp,
      label: t("settings.voice.screenShare.title"),
      panel: "screenShare",
      section: "voice",
    },
  ];

  const appearanceItems: NavItem[] = [
    {
      icon: Languages,
      label: t("settings.appearance.language.title"),
      panel: "language",
      section: "appearance",
    },
    {
      icon: Palette,
      label: t("settings.appearance.theme.title"),
      panel: "theme",
      section: "appearance",
    },
    {
      icon: Type,
      label: t("settings.appearance.messageFont.title"),
      panel: "messageFont",
      section: "appearance",
    },
  ];

  const advancedItems: NavItem[] = [
    {
      icon: ImageIcon,
      label: t("settings.appearance.icons.title"),
      panel: "appIcon",
      section: "appearance",
    },
    {
      icon: PanelLeft,
      label: t("settings.appearance.advanced.serverRailTitle"),
      panel: "serverRail",
      section: "appearance",
    },
    {
      icon: LayoutDashboard,
      label: t("settings.appearance.advanced.mainCanvasTitle"),
      panel: "mainCanvas",
      section: "appearance",
    },
    {
      icon: Sidebar,
      label: t("settings.appearance.advanced.channelSidebarTitle"),
      panel: "channelSidebar",
      section: "appearance",
    },
  ];

  const notificationItems: NavItem[] = [
    {
      icon: BellRing,
      label: t("settings.notifications.general.title"),
      panel: "general",
      section: "notifications",
    },
    {
      icon: Volume2,
      label: t("settings.notifications.sounds.title"),
      panel: "sounds",
      section: "notifications",
    },
  ];

  const aboutItems: NavItem[] = [
    { icon: Info, label: t("common.overview"), panel: "overview", section: "about" },
    {
      icon: FileText,
      label: t("settings.about.buildInfo.title"),
      panel: "build",
      section: "about",
    },
    {
      icon: Sparkles,
      label: t("settings.about.whatsNew.title"),
      panel: "whatsNew",
      section: "about",
    },
    {
      icon: MonitorUp,
      label: t("settings.about.desktop.title"),
      panel: "desktop",
      section: "about",
    },
    {
      icon: Code2,
      label: t("settings.about.developer.title"),
      panel: "developer",
      section: "about",
    },
  ];

  const mobileSections: Array<{ icon: LucideIcon; label: string; section: SettingsSectionKey }> = [
    { icon: UserRound, label: t("settings.account.title"), section: "account" },
    { icon: Headphones, label: t("settings.groups.voiceVideo.title"), section: "voice" },
    { icon: Sparkles, label: t("settings.groups.appearance.title"), section: "appearance" },
    {
      icon: BellRing,
      label: t("settings.groups.notifications.title"),
      section: "notifications",
    },
    { icon: Info, label: t("settings.about.title"), section: "about" },
  ];

  const mobilePanelItems: NavItem[] =
    section === "voice"
      ? voiceItems
      : section === "appearance"
        ? [
            ...appearanceItems,
            {
              icon: Sparkles,
              label: t("settings.appearance.advanced.title"),
              panel: "advanced",
              section: "appearance",
            },
            ...advancedItems,
          ]
        : section === "notifications"
          ? notificationItems
          : section === "about"
            ? aboutItems
            : [];

  return (
    <>
      <aside className="lg:hidden" data-testid="settings-mobile-sidebar">
        <SettingsCard className="min-w-0 max-w-full overflow-hidden p-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.86)] px-3 text-sm font-bold text-app-foreground shadow-[0_10px_30px_hsl(var(--shadow-color)/0.06)] transition hover:bg-[hsl(var(--surface-soft)/0.82)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              href="/channels"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("settings.backToChannels")}
            </Link>
            <p className="text-app-soft text-[11px] font-bold uppercase tracking-[0.22em]">
              {t("common.settings")}
            </p>
          </div>

          <div className="mt-4">
            <SettingsSearch />
          </div>

          <div className="mt-5">
            <h1 className="text-app-foreground text-2xl font-bold leading-tight">
              {t("settings.title")}
            </h1>
            <p className="text-app-muted mt-2 line-clamp-2 text-sm leading-6">
              {t("settings.description")}
            </p>
          </div>

          <nav
            aria-label={t("settings.title")}
            className="mt-5 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1"
          >
            {mobileSections.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                    section === item.section
                      ? "border-[hsl(var(--primary)/0.36)] bg-[hsl(var(--primary)/0.13)] text-[hsl(var(--primary))]"
                      : "border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface)/0.72)] text-app-muted hover:text-app-foreground",
                  )}
                  data-testid={`settings-mobile-section-${item.section}`}
                  key={item.section}
                  onClick={() => goTo(item.section)}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {mobilePanelItems.length > 0 ? (
            <nav
              aria-label={`${t("settings.title")} ${t("common.overview")}`}
              className="mt-3 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1"
            >
              {mobilePanelItems.map((item) => {
                const Icon = item.icon;
                const isActive = section === item.section && (item.panel ?? null) === panel;

                return (
                  <button
                    className={cn(
                      "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      isActive
                        ? "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                        : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.68)] text-app-muted hover:text-app-foreground",
                    )}
                    data-testid={`settings-mobile-panel-${item.section}-${item.panel ?? "all"}`}
                    key={`${item.section}-${item.panel ?? "all"}`}
                    onClick={() => goTo(item.section, item.panel ?? null)}
                    type="button"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          ) : null}
        </SettingsCard>
      </aside>

      <aside
        className="hidden h-[calc(100dvh-2.5rem)] min-h-[640px] overflow-hidden rounded-[32px] border border-[hsl(var(--border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--surface)/0.96),hsl(var(--surface-soft)/0.62))] p-4 shadow-[0_28px_80px_hsl(var(--shadow-color)/0.1)] backdrop-blur-xl lg:sticky lg:top-5 lg:flex lg:flex-col"
        data-testid="settings-desktop-sidebar"
      >
        <div className="flex items-center gap-3 rounded-[24px] border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface)/0.72)] p-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary)/0.72))] text-sm font-black text-white shadow-[0_16px_34px_hsl(var(--primary)/0.22)]">
            W
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-app-foreground">Whispr</p>
            <p className="truncate text-xs font-semibold text-app-soft">{t("settings.title")}</p>
          </div>
        </div>

        <Link
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.82)] px-4 text-sm font-bold text-app-foreground shadow-[0_12px_32px_hsl(var(--shadow-color)/0.06)] transition hover:bg-[hsl(var(--surface-soft)/0.82)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          href="/channels"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("settings.backToChannels")}
        </Link>

        <div className="mt-4">
          <SettingsSearch />
        </div>

        <div className="mt-6 px-1">
          <h1 className="text-app-foreground text-3xl font-extrabold leading-tight tracking-tight">
            {t("settings.title")}
          </h1>
          <p className="text-app-muted mt-2 text-sm leading-6">{t("settings.description")}</p>
        </div>

        <nav
          aria-label={t("settings.title")}
          className="settings-scrollbar mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1"
        >
          <SettingsSection icon={UserRound} label={t("settings.account.badge")}>
            <SettingsNavItem
              active={section === "account"}
              icon={UserRound}
              label={t("settings.account.nav")}
              onClick={() => goTo("account")}
            />
          </SettingsSection>

          <SettingsSection icon={Headphones} label={t("settings.groups.voiceVideo.badge")}>
            {voiceItems.map((item) => (
              <SettingsNavItem
                active={section === item.section && panel === item.panel}
                icon={item.icon}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}
          </SettingsSection>

          <SettingsSection icon={Sparkles} label={t("settings.groups.appearance.badge")}>
            {appearanceItems.map((item) => (
              <SettingsNavItem
                active={section === item.section && panel === item.panel}
                icon={item.icon}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}

            <button
              aria-expanded={advancedOpen}
              className={cn(
                "group relative flex min-h-11 w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]",
                section === "appearance" && isAdvancedAppearancePanel(panel)
                  ? "bg-[linear-gradient(90deg,hsl(var(--primary)/0.16),hsl(var(--primary)/0.08))] text-[hsl(var(--primary))]"
                  : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.82)] hover:text-app-foreground",
              )}
              onClick={() => {
                setAdvancedOpen((current) => !current);
                goTo("appearance", "advanced");
              }}
              type="button"
            >
              <span
                className={cn(
                  "absolute left-0 top-2 h-[calc(100%-1rem)] w-1 rounded-r-full transition",
                  section === "appearance" && isAdvancedAppearancePanel(panel)
                    ? "bg-[hsl(var(--primary))] opacity-100"
                    : "bg-transparent opacity-0",
                )}
              />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--surface-soft)/0.6)] text-app-soft group-hover:text-app-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {t("settings.appearance.advanced.title")}
              </span>
              <ChevronDown
                className={cn("h-4 w-4 transition", advancedOpen ? "rotate-180" : "")}
              />
            </button>

            {advancedOpen ? (
              <div className="space-y-1.5 border-l border-[hsl(var(--border)/0.7)] pl-3">
                {advancedItems.map((item) => (
                  <SettingsNavItem
                    active={section === item.section && panel === item.panel}
                    icon={item.icon}
                    key={item.panel}
                    label={item.label}
                    nested
                    onClick={() => goTo(item.section, item.panel)}
                  />
                ))}
              </div>
            ) : null}
          </SettingsSection>

          <SettingsSection icon={BellRing} label={t("settings.groups.notifications.badge")}>
            {notificationItems.map((item) => (
              <SettingsNavItem
                active={section === item.section && panel === item.panel}
                icon={item.icon}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}
          </SettingsSection>

          <SettingsSection icon={Info} label={t("settings.about.title")}>
            {aboutItems.map((item) => (
              <SettingsNavItem
                active={section === item.section && panel === item.panel}
                icon={item.icon}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}
          </SettingsSection>
        </nav>

        <SettingsUserFooter user={currentUser} />
      </aside>
    </>
  );
}
