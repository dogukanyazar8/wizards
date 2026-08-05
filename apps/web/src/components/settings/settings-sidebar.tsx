"use client";

import {
  ArrowLeft,
  Award,
  BellRing,
  ChevronDown,
  Code2,
  FileText,
  Gamepad2,
  Headphones,
  ImageIcon,
  Info,
  Languages,
  MonitorUp,
  Palette,
  Search,
  Settings,
  Sparkles,
  Type,
  UserRound,
  Video,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import {
  buildSettingsHref,
  resolveSettingsSelection,
  type SettingsPanelKey,
  type SettingsSelection,
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
  mode?: "dialog" | "page";
  onBackToChannels?: () => void;
  onSelectionChange?: (selection: SettingsSelection) => void;
  selection?: SettingsSelection;
};

const DEFAULT_OPEN_SETTING_GROUPS: Record<SettingsSectionKey, boolean> = {
  account: false,
  appearance: false,
  about: false,
  desktop: false,
  notifications: false,
  voice: false,
};

function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.84)] shadow-[0_12px_34px_hsl(var(--shadow-color)/0.05)] backdrop-blur-xl",
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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-soft transition group-focus-within:text-[hsl(var(--primary))]" />
      <input
        aria-label={t("settings.search.placeholder")}
        className="h-9 w-full rounded-[13px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.9)] pl-9 pr-12 text-xs font-medium text-app-foreground shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.5)] outline-hidden transition placeholder:text-app-soft focus:border-[hsl(var(--primary)/0.45)] focus:ring-4 focus:ring-[hsl(var(--primary)/0.12)]"
        id={searchId}
        placeholder={t("settings.search.placeholder")}
        type="search"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-lg border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.72)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-app-soft sm:inline-flex">
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
        "group relative flex min-h-9 w-full items-center gap-2 overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]",
        active
          ? "bg-[linear-gradient(90deg,hsl(var(--primary)/0.16),hsl(var(--primary)/0.08))] text-[hsl(var(--primary))] shadow-[0_16px_35px_hsl(var(--primary)/0.12)]"
          : nested
            ? "text-app-soft hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground"
            : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.82)] hover:text-app-foreground",
        nested ? "pl-3.5 text-xs font-medium" : "",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-r-full transition",
          active ? "bg-[hsl(var(--primary))] opacity-100" : "bg-transparent opacity-0",
        )}
      />
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition",
          active
            ? "bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
            : "bg-[hsl(var(--surface-soft)/0.6)] text-app-soft group-hover:text-app-foreground",
          nested ? "h-6 w-6 rounded-lg" : "",
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", nested ? "h-3 w-3" : "")} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function SettingsSection({
  active = false,
  children,
  expanded = true,
  icon: Icon,
  label,
  onToggle,
}: {
  active?: boolean;
  children: ReactNode;
  expanded?: boolean;
  icon: LucideIcon;
  label: string;
  onToggle?: () => void;
}) {
  const contentId = useId();
  const highlighted = active || expanded;

  return (
    <section className="space-y-1.5" aria-label={label}>
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        className={cn(
          "group flex min-h-8 w-full items-center gap-2 rounded-lg px-2 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]",
          active
            ? "bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]"
            : expanded
              ? "bg-[hsl(var(--surface-soft)/0.72)] text-app-foreground"
              : "text-app-soft hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground",
        )}
        onClick={onToggle}
        type="button"
      >
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-md transition",
            active
              ? "bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
              : highlighted
                ? "bg-[hsl(var(--surface))] text-app-foreground"
                : "bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]",
          )}
        >
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.18em]">
          {label}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition duration-150 motion-reduce:transition-none",
            expanded ? "rotate-180" : "",
            highlighted ? "text-[hsl(var(--primary))]" : "",
          )}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <div className="space-y-1" id={contentId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface)/0.72)] p-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SettingsUserFooter({ user }: { user: SettingsSidebarUser }) {
  return (
    <SettingsRow className="mt-2 shrink-0 bg-[linear-gradient(135deg,hsl(var(--surface)/0.92),hsl(var(--surface-soft)/0.72))] shadow-[0_8px_20px_hsl(var(--shadow-color)/0.05)]">
      <div className="relative">
        <Avatar
          alt={user.displayName}
          className="h-8 w-8 border-[hsl(var(--primary)/0.2)]"
          fallback={user.displayName || user.username}
          src={user.avatarUrl}
        />
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[hsl(var(--surface))] bg-emerald-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-app-foreground">{user.displayName}</p>
        <p className="truncate text-xs font-medium text-app-soft">@{user.username}</p>
      </div>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg text-app-soft transition hover:bg-[hsl(var(--surface-soft))] hover:text-app-foreground">
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </SettingsRow>
  );
}

export function SettingsSidebar({
  currentUser,
  mode = "page",
  onBackToChannels,
  onSelectionChange,
  selection,
}: SettingsSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const routeSelection = resolveSettingsSelection(searchParams);
  const { panel, section } = selection ?? routeSelection;
  const [openGroups, setOpenGroups] = useState(DEFAULT_OPEN_SETTING_GROUPS);

  const goTo = (nextSection: SettingsSectionKey, nextPanel?: SettingsPanelKey | null) => {
    if (onSelectionChange) {
      onSelectionChange({ panel: nextPanel ?? null, section: nextSection });
      return;
    }

    router.push(buildSettingsHref(nextSection, nextPanel));
  };

  const toggleGroup = (group: SettingsSectionKey) => {
    setOpenGroups((current) => {
      const shouldOpen = !current[group];

      return {
        account: group === "account" ? shouldOpen : false,
        appearance: group === "appearance" ? shouldOpen : false,
        about: group === "about" ? shouldOpen : false,
        desktop: group === "desktop" ? shouldOpen : false,
        notifications: group === "notifications" ? shouldOpen : false,
        voice: group === "voice" ? shouldOpen : false,
      };
    });
  };

  const renderBackToChannels = (className: string) => {
    const content = (
      <>
        <ArrowLeft className="h-4 w-4" />
        {t("settings.backToChannels")}
      </>
    );

    if (onBackToChannels) {
      return (
        <button className={className} onClick={onBackToChannels} type="button">
          {content}
        </button>
      );
    }

    return (
      <Link className={className} href="/channels">
        {content}
      </Link>
    );
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
    {
      icon: ImageIcon,
      label: t("settings.appearance.icons.title"),
      panel: "appIcon",
      section: "appearance",
    },
  ];

  const desktopItems: NavItem[] = [
    {
      icon: MonitorUp,
      label: t("settings.desktop.behavior.title"),
      panel: "desktopBehavior",
      section: "desktop",
    },
    {
      icon: Gamepad2,
      label: t("settings.desktop.voice.title"),
      panel: "desktopVoice",
      section: "desktop",
    },
    {
      icon: Info,
      label: t("settings.desktop.diagnostics.title"),
      panel: "desktopDiagnostics",
      section: "desktop",
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
      icon: Code2,
      label: t("settings.about.developer.title"),
      panel: "developer",
      section: "about",
    },
  ];

  const mobileSections: Array<{ icon: LucideIcon; label: string; section: SettingsSectionKey }> = [
    { icon: UserRound, label: t("settings.account.title"), section: "account" },
    { icon: Headphones, label: t("settings.groups.voiceVideo.title"), section: "voice" },
    { icon: MonitorUp, label: t("settings.groups.desktop.title"), section: "desktop" },
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
      : section === "desktop"
        ? desktopItems
        : section === "appearance"
          ? appearanceItems
          : section === "notifications"
            ? notificationItems
            : section === "about"
              ? aboutItems
              : [];

  return (
    <>
      <aside
        className="min-w-0 max-w-full overflow-hidden lg:hidden"
        data-testid="settings-mobile-sidebar"
      >
        <SettingsCard className="w-full min-w-0 max-w-full overflow-hidden p-2">
          <div className="flex items-center justify-between gap-3">
            {renderBackToChannels(
              "inline-flex min-h-10 items-center gap-2 rounded-xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.86)] px-3 text-xs font-bold text-app-foreground shadow-[0_8px_22px_hsl(var(--shadow-color)/0.05)] transition hover:bg-[hsl(var(--surface-soft)/0.82)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
            )}
            <p className="text-app-soft text-[11px] font-bold uppercase tracking-[0.22em]">
              {t("common.settings")}
            </p>
          </div>

          <div className="mt-2.5">
            <SettingsSearch />
          </div>

          <div className="mt-3">
            <h1 className="text-app-foreground text-lg font-bold leading-tight">
              {t("settings.title")}
            </h1>
            <p className="text-app-muted mt-1 line-clamp-2 text-xs leading-5">
              {t("settings.description")}
            </p>
          </div>

          <nav
            aria-label={t("settings.title")}
            className="mt-3 flex max-w-full gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {mobileSections.map((item) => {
              const Icon = item.icon;
              const isActive = section === item.section;

              return (
                <button
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                    isActive
                      ? "border-[hsl(var(--primary)/0.36)] bg-[hsl(var(--primary)/0.13)] text-[hsl(var(--primary))] shadow-[inset_0_-2px_0_hsl(var(--primary)/0.42)]"
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
              className="mt-2 flex max-w-full gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {mobilePanelItems.map((item) => {
                const Icon = item.icon;
                const isActive = section === item.section && (item.panel ?? null) === panel;

                return (
                  <button
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      isActive
                        ? "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] shadow-[inset_0_-2px_0_hsl(var(--primary)/0.4)]"
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
        className={cn(
          "hidden overflow-hidden rounded-[22px] border border-[hsl(var(--border)/0.66)] bg-[linear-gradient(180deg,hsl(var(--surface)/0.96),hsl(var(--surface-soft)/0.58))] p-2.5 shadow-[0_14px_40px_hsl(var(--shadow-color)/0.06)] backdrop-blur-xl lg:flex lg:flex-col",
          mode === "dialog"
            ? "h-full min-h-0"
            : "h-[calc(100dvh-2rem)] min-h-[600px] lg:sticky lg:top-4",
        )}
        data-testid="settings-desktop-sidebar"
      >
        <div className="flex items-center gap-2 rounded-[16px] border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface)/0.72)] p-2">
          <BrandLogo
            className="shrink-0 [&_.whispr-logo-icon]:h-9 [&_.whispr-logo-icon]:w-9 [&_.whispr-logo-icon]:rounded-[12px] [&_.whispr-logo-wordmark]:hidden"
            interactive={false}
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold text-app-foreground">Whispr</p>
            <p className="truncate text-xs font-semibold text-app-soft">{t("settings.title")}</p>
          </div>
        </div>

        {renderBackToChannels(
          "mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.82)] px-3 text-xs font-bold text-app-foreground shadow-[0_10px_24px_hsl(var(--shadow-color)/0.05)] transition hover:bg-[hsl(var(--surface-soft)/0.82)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        )}

        <div className="mt-3">
          <SettingsSearch />
        </div>

        <div className="mt-3 px-1">
          <h1 className="text-app-foreground text-xl font-extrabold leading-tight tracking-tight">
            {t("settings.title")}
          </h1>
          <p className="text-app-muted mt-1.5 text-xs leading-5">{t("settings.description")}</p>
        </div>

        <nav
          aria-label={t("settings.title")}
          className="settings-scrollbar mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
        >
          <SettingsSection
            active={section === "account" && openGroups.account}
            expanded={openGroups.account}
            icon={UserRound}
            label={t("settings.account.badge")}
            onToggle={() => toggleGroup("account")}
          >
            <SettingsNavItem
              active={section === "account" && panel !== "badges"}
              icon={UserRound}
              label={t("settings.account.nav")}
              onClick={() => goTo("account")}
            />
            <SettingsNavItem
              active={section === "account" && panel === "badges"}
              icon={Award}
              label={t("settings.account.badges.title")}
              onClick={() => goTo("account", "badges")}
            />
          </SettingsSection>

          <SettingsSection
            active={section === "voice" && openGroups.voice}
            expanded={openGroups.voice}
            icon={Headphones}
            label={t("settings.groups.voiceVideo.badge")}
            onToggle={() => toggleGroup("voice")}
          >
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

          <SettingsSection
            active={section === "desktop" && openGroups.desktop}
            expanded={openGroups.desktop}
            icon={MonitorUp}
            label={t("settings.groups.desktop.badge")}
            onToggle={() => toggleGroup("desktop")}
          >
            {desktopItems.map((item) => (
              <SettingsNavItem
                active={section === item.section && panel === item.panel}
                icon={item.icon}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}
          </SettingsSection>

          <SettingsSection
            active={section === "appearance" && openGroups.appearance}
            expanded={openGroups.appearance}
            icon={Sparkles}
            label={t("settings.groups.appearance.badge")}
            onToggle={() => toggleGroup("appearance")}
          >
            {appearanceItems.map((item) => (
              <SettingsNavItem
                active={section === item.section && panel === item.panel}
                icon={item.icon}
                key={item.panel}
                label={item.label}
                onClick={() => goTo(item.section, item.panel)}
              />
            ))}
          </SettingsSection>

          <SettingsSection
            active={section === "notifications" && openGroups.notifications}
            expanded={openGroups.notifications}
            icon={BellRing}
            label={t("settings.groups.notifications.badge")}
            onToggle={() => toggleGroup("notifications")}
          >
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

          <SettingsSection
            active={section === "about" && openGroups.about}
            expanded={openGroups.about}
            icon={Info}
            label={t("settings.about.title")}
            onToggle={() => toggleGroup("about")}
          >
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
