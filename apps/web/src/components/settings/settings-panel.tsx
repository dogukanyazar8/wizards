"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Accessibility,
  BellRing,
  Camera,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  Globe2,
  ImageIcon,
  Info,
  KeyRound,
  Languages,
  LayoutPanelTop,
  LockKeyhole,
  Mail,
  MessageCircle,
  MonitorUp,
  ShieldCheck,
  Sparkles,
  Type,
  UserRound,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { UserStatus } from "@wizards/db";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { useI18n } from "@/components/providers/locale-provider";
import { DesktopDiagnosticsPanel } from "@/components/desktop/desktop-diagnostics-panel";
import { ProfileAvatarField } from "@/components/settings/profile-avatar-field";
import { ThemePicker } from "@/components/theme/theme-picker";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CameraPreferencesPanel } from "@/components/voice/camera-preferences-panel";
import { ScreenSharePreferencesPanel } from "@/components/voice/screen-share-preferences-panel";
import { VoicePreferencesPanel } from "@/components/voice/voice-preferences-panel";
import {
  CHANNEL_SIDEBAR_WIDTH_STEP,
  COMPACT_SERVER_RAIL_ICON_SIZE,
  COMPACT_SERVER_RAIL_TOUCH_SIZE,
  COMPACT_SERVER_RAIL_WIDTH,
  DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  DEFAULT_MAIN_PANEL_WIDTH,
  MAX_CHANNEL_SIDEBAR_WIDTH,
  MAX_MAIN_PANEL_WIDTH,
  MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  MIN_CHANNEL_SIDEBAR_WIDTH,
  MIN_MAIN_PANEL_WIDTH,
  MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  NOTIFICATION_LIMIT_OPTIONS,
  NOTIFICATION_POPUP_TIMEOUT_STEP,
  MAIN_PANEL_WIDTH_STEP,
} from "@/lib/appearance";
import { APP_ICON_OPTIONS, type AppIconId } from "@/lib/app-icons";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import {
  MESSAGE_FONT_OPTIONS,
  normalizeMessageFontId,
  type MessageFontId,
} from "@/lib/message-fonts";
import {
  type AccountSettingsState,
  type UpdateAccountSettingsResult,
  updateAccountSettingsAction,
} from "@/lib/account/actions";
import {
  getProfileCompletionSummary,
  type ProfileCompletionSummary,
} from "@/lib/account/profile-completion";
import { fetchLayoutSettings, patchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import {
  buildSettingsHref,
  resolveSettingsSelection,
  type SettingsPanelKey,
} from "@/lib/settings/navigation";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SOUND_EFFECT_PROFILES,
  isSoundProfileKey,
  resolveSoundEffectPath,
  SOUND_PROFILE_OPTIONS,
  useSoundStore,
  type SoundEffectKey,
  type SoundProfileKey,
} from "@/store/sound-store";
import type { WhisprReleaseNote } from "@/lib/app-version";

const FEATURED_CONTRIBUTOR_NAME = "O\u011Fuz G\u00FC\u011F\u00FCmc\u00FCo\u011Flu";

type SettingsPanelProps = {
  buildInfo: {
    buildId: string;
    buildTime: string;
    contributors: string[];
    developerName: string;
    lastUpdated: string;
    notes: WhisprReleaseNote[];
    releaseChannel: string;
    version: string;
  };
  initialAccount: AccountSettingsState;
  uploadthingEnabled: boolean;
};

type AccountField = "displayName" | "email" | "status" | "username";
type DmPolicyValue = UserLayoutSettings["dmPolicy"];
type FriendRequestPolicyValue = UserLayoutSettings["friendRequestPolicy"];

const DM_POLICY_OPTIONS = [
  "EVERYONE",
  "FRIENDS",
  "MUTUAL_SERVERS",
  "NOBODY",
] as const satisfies readonly DmPolicyValue[];

const FRIEND_REQUEST_POLICY_OPTIONS = [
  "EVERYONE",
  "MUTUAL_SERVERS",
  "MUTUAL_FRIENDS",
  "NOBODY",
] as const satisfies readonly FriendRequestPolicyValue[];

function getDmPolicyLabelKey(policy: DmPolicyValue) {
  return `settings.account.privacy.dmPolicy.${policy}`;
}

function getFriendRequestPolicyLabelKey(policy: FriendRequestPolicyValue) {
  return `settings.account.privacy.friendRequestPolicy.${policy}`;
}

function SectionHero({
  badge,
  description,
  title,
}: {
  badge: string;
  description: string;
  title: string;
}) {
  return (
    <section className="app-panel min-w-0 max-w-full overflow-hidden rounded-[28px] border p-5 sm:rounded-[32px] sm:p-7">
      <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">{badge}</p>
      <h2 className="text-app-foreground mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <p className="text-app-muted mt-3 max-w-3xl text-sm leading-7">{description}</p>
    </section>
  );
}

function SettingCard({
  badge,
  children,
  description,
  icon: Icon,
  title,
}: {
  badge?: string;
  children: ReactNode;
  description: string;
  icon: typeof LayoutPanelTop;
  title: string;
}) {
  return (
    <section className="app-panel min-w-0 max-w-full overflow-hidden rounded-[28px] border p-5 sm:rounded-[30px] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="app-panel-soft mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[hsl(var(--primary))]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-app-foreground text-lg font-semibold">{title}</h3>
            <p className="text-app-muted mt-1 text-sm leading-6">{description}</p>
          </div>
        </div>
        {badge ? (
          <Badge className="shrink-0" tone="muted">
            {badge}
          </Badge>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-panel-soft rounded-[22px] border p-4">
      <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="text-app-foreground mt-2 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function ToggleRow({
  checked,
  description,
  disabled = false,
  label,
  onChange,
  testId,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (nextValue: boolean) => void;
  testId?: string;
}) {
  return (
    <div className="app-panel-soft rounded-[24px] border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-foreground">{label}</p>
          <p className="text-app-muted mt-1 text-sm leading-6">{description}</p>
        </div>
        <button
          aria-checked={checked}
          className={cn(
            "relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-7 sm:w-12",
            checked
              ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.18)]"
              : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)]",
            disabled && "cursor-not-allowed opacity-55",
          )}
          data-testid={testId}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          role="switch"
          type="button"
        >
          <span
            className={cn(
              "absolute left-1 h-6 w-6 rounded-full bg-white shadow-[0_6px_16px_hsl(var(--shadow-color)/0.16)] transition sm:h-5 sm:w-5",
              checked && "translate-x-6 bg-[hsl(var(--primary))] sm:translate-x-5",
            )}
          />
        </button>
      </div>
    </div>
  );
}

function SoundVolumeRow({
  checked,
  description,
  label,
  onChange,
  onPreview,
  onProfileChange,
  onVolumeChange,
  profileLabel,
  profileOptions,
  profileValue,
  previewLabel,
  testId,
  volume,
  volumeLabel,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (nextValue: boolean) => void;
  onPreview: () => void;
  onProfileChange: (nextValue: SoundProfileKey) => void;
  onVolumeChange: (nextValue: number) => void;
  profileLabel: string;
  profileOptions: Array<{ label: string; value: SoundProfileKey }>;
  profileValue: SoundProfileKey;
  previewLabel: string;
  testId?: string;
  volume: number;
  volumeLabel: string;
}) {
  return (
    <div className="app-panel-soft rounded-[24px] border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-foreground">{label}</p>
          <p className="text-app-muted mt-1 text-sm leading-6">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="min-h-10 rounded-2xl border border-[hsl(var(--border)/0.78)] px-3 py-2 text-xs font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-50"
            disabled={!checked || volume === 0}
            onClick={onPreview}
            type="button"
          >
            {previewLabel}
          </button>
          <button
            aria-label={label}
            aria-checked={checked}
            className={cn(
              "relative inline-flex h-8 w-14 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-7 sm:w-12",
              checked
                ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.18)]"
                : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)]",
            )}
            data-testid={testId ? `${testId}-toggle` : undefined}
            onClick={() => onChange(!checked)}
            role="switch"
            type="button"
          >
            <span
              className={cn(
                "absolute left-1 h-6 w-6 rounded-full bg-white shadow-[0_6px_16px_hsl(var(--shadow-color)/0.16)] transition sm:h-5 sm:w-5",
                checked && "translate-x-6 bg-[hsl(var(--primary))] sm:translate-x-5",
              )}
            />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_minmax(180px,240px)]">
        <div>
          <label
            className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft"
            htmlFor={testId ? `${testId}-profile` : undefined}
          >
            {profileLabel}
          </label>
          <select
            className="app-panel mt-2 w-full rounded-2xl border px-4 py-3 text-sm text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            disabled={!checked}
            id={testId ? `${testId}-profile` : undefined}
            data-testid={testId ? `${testId}-profile` : undefined}
            onChange={(event) => onProfileChange(event.target.value as SoundProfileKey)}
            value={profileValue}
          >
            {profileOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft">
              {volumeLabel}
            </label>
            <span className="rounded-full border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.72)] px-2.5 py-1 text-xs font-semibold text-app-foreground">
              {volume}%
            </span>
          </div>
          <input
            aria-label={volumeLabel}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!checked}
            data-testid={testId ? `${testId}-volume` : undefined}
            max={100}
            min={0}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            step={1}
            type="range"
            value={volume}
          />
        </div>
      </div>
    </div>
  );
}

function RangeSliderCard({
  description,
  labels,
  max,
  min,
  onChange,
  preview,
  step,
  testId,
  title,
  value,
}: {
  description: string;
  labels: [string, string, string];
  max: number;
  min: number;
  onChange: (nextValue: number) => void;
  preview: ReactNode;
  step: number;
  testId?: string;
  title: string;
  value: number;
}) {
  const sliderValue = Math.min(max, Math.max(min, value));

  return (
    <SettingCard description={description} icon={LayoutPanelTop} title={title}>
      <div className="flex items-center justify-end">
        <div className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2">
          <span className="text-app-foreground text-sm font-medium">{value}px</span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-4 sm:p-5">
        <input
          aria-label={title}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))]"
          max={max}
          min={min}
          data-testid={testId}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="range"
          value={sliderValue}
        />
        <div className="text-app-muted mt-3 flex items-center justify-between text-xs font-medium">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
          <span>{labels[2]}</span>
        </div>
        <div className="mt-5">{preview}</div>
      </div>
    </SettingCard>
  );
}

function CompactServerRailPreview({
  description,
  iconLabel,
  modeLabel,
  targetLabel,
  title,
  widthLabel,
}: {
  description: string;
  iconLabel: string;
  modeLabel: string;
  targetLabel: string;
  title: string;
  widthLabel: string;
}) {
  const metrics = [
    { label: widthLabel, value: `${COMPACT_SERVER_RAIL_WIDTH}px` },
    { label: iconLabel, value: `${COMPACT_SERVER_RAIL_ICON_SIZE}px` },
    { label: targetLabel, value: `${COMPACT_SERVER_RAIL_TOUCH_SIZE}px` },
  ];

  return (
    <SettingCard description={description} icon={LayoutPanelTop} title={title}>
      <div
        className="grid gap-4 rounded-[28px] border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-soft)/0.22)] p-4 md:grid-cols-[auto_minmax(0,1fr)]"
        data-testid="settings-server-rail-compact-preview"
      >
        <div
          aria-hidden="true"
          className="flex flex-col items-center rounded-[24px] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.86),hsl(var(--surface-soft)/0.34))] px-2 py-3"
          style={{ width: COMPACT_SERVER_RAIL_WIDTH }}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[hsl(var(--surface-card)/0.7)] ring-1 ring-[hsl(var(--border)/0.5)]">
            <div className="h-7 w-7 rounded-[12px] bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--ambient-1)))]" />
          </div>
          <div className="mt-2 h-px w-7 rounded-full bg-[hsl(var(--border)/0.64)]" />
          <div className="mt-2 flex flex-col gap-1.5">
            {[0, 1, 2, 3].map((index) => (
              <div
                className="relative flex items-center justify-center rounded-[18px]"
                key={index}
                style={{
                  height: COMPACT_SERVER_RAIL_TOUCH_SIZE,
                  width: COMPACT_SERVER_RAIL_TOUCH_SIZE,
                }}
              >
                {index === 1 ? (
                  <span className="absolute left-0 h-7 w-1 rounded-full bg-[hsl(var(--primary))]" />
                ) : null}
                <div
                  className={cn(
                    "rounded-[16px] ring-1",
                    index === 1
                      ? "bg-[hsl(var(--primary)/0.16)] ring-[hsl(var(--primary)/0.28)]"
                      : "bg-[hsl(var(--surface-card)/0.7)] ring-transparent",
                  )}
                  style={{
                    height: COMPACT_SERVER_RAIL_ICON_SIZE,
                    width: COMPACT_SERVER_RAIL_ICON_SIZE,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="inline-flex rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
            {modeLabel}
          </div>
          <p className="max-w-2xl text-sm leading-6 text-app-muted">{description}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div className="rounded-[20px] bg-[hsl(var(--surface-card)/0.68)] p-3" key={metric.label}>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-app-soft">
                  {metric.label}
                </p>
                <p className="mt-1 text-sm font-extrabold text-app-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SettingCard>
  );
}

function StatusDot({ status }: { status: UserStatus }) {
  const colorClass =
    status === UserStatus.ONLINE
      ? "bg-emerald-400"
      : status === UserStatus.IDLE
        ? "bg-amber-400"
        : status === UserStatus.DND
          ? "bg-rose-400"
          : status === UserStatus.INVISIBLE
            ? "bg-slate-500"
            : "bg-slate-400";

  return <span className={cn("h-2.5 w-2.5 rounded-full", colorClass)} />;
}

function buildAvatarFallback(account: AccountSettingsState) {
  const source = account.displayName?.trim() || account.username;
  return source
    .split(/\s+/)
    .map((token) => token[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getAccountStatusLabelKey(status: UserStatus) {
  return status === UserStatus.INVISIBLE
    ? "settings.account.status.invisible"
    : `friends.status.${status.toLowerCase()}`;
}

function getBrowserTimeZoneLabel(timeZone: string, locale: "en" | "tr") {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") || timeZone;
  const localizedCity = locale === "tr" && city === "Istanbul" ? "\u0130stanbul" : city;

  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+03:00";
    return `(${offset.replace("GMT", "UTC")}) ${localizedCity}`;
  } catch {
    return localizedCity;
  }
}

function getLocaleDisplayName(locale: "en" | "tr") {
  return locale === "tr" ? "T\u00fcrk\u00e7e" : "English";
}

function copyAccountValue(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(value).catch(() => undefined);
}

function AccountPageHeader({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="min-w-0 max-w-4xl px-1 py-2">
      <p className="text-xs font-black uppercase tracking-[0.26em] text-[hsl(var(--primary))]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-app-foreground sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-app-muted sm:text-base">
        {description}
      </p>
    </section>
  );
}

function AccountInfoTile({
  action,
  label,
  value,
}: {
  action?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-[hsl(var(--border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--surface)/0.92),hsl(var(--surface-soft)/0.42))] p-4 shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.45)]">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-app-soft">{label}</p>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 break-words text-sm font-bold text-app-foreground">{value}</div>
        {action}
      </div>
    </div>
  );
}

function ProfileSummaryCard({
  account,
  completion,
  onChangeStatus,
  onEdit,
  statusLabel,
  t,
  visibleName,
}: {
  account: AccountSettingsState;
  completion: ProfileCompletionSummary;
  onChangeStatus: () => void;
  onEdit: () => void;
  statusLabel: string;
  t: (key: string, values?: Record<string, number | string>) => string;
  visibleName: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[32px] border border-[hsl(var(--border)/0.72)] bg-[linear-gradient(135deg,hsl(var(--surface)/0.98),hsl(var(--surface-soft)/0.58))] p-5 shadow-[0_24px_70px_hsl(var(--shadow-color)/0.1)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <UserRound className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-app-foreground">
            {t("settings.account.summaryTitle")}
          </h3>
          <p className="mt-1 text-sm leading-6 text-app-muted">
            {t("settings.account.summaryDescription")}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <Avatar
              alt={visibleName}
              className="h-24 w-24 rounded-full border-[hsl(var(--primary)/0.2)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.24),hsl(var(--primary)/0.1))] text-xl shadow-[0_22px_60px_hsl(var(--primary)/0.12)] ring-4 ring-[hsl(var(--primary)/0.08)] sm:h-28 sm:w-28"
              fallback={buildAvatarFallback(account)}
              src={account.avatarUrl}
            />
            <span className="absolute bottom-2 right-1 h-5 w-5 rounded-full border-4 border-[hsl(var(--surface))] bg-emerald-500 shadow-[0_8px_20px_hsl(var(--shadow-color)/0.18)]" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="max-w-full truncate text-2xl font-extrabold tracking-tight text-app-foreground">
                {visibleName}
              </h4>
              <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600">
                {statusLabel}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-app-muted">@{account.username}</p>
            <p className="mt-2 break-words text-sm font-medium text-app-muted">{account.email}</p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[190px]">
          <Button className="w-full justify-center" onClick={onEdit} type="button">
            {t("settings.account.profile.edit")}
          </Button>
          <Button
            className="w-full justify-center"
            onClick={onChangeStatus}
            type="button"
            variant="outline"
          >
            {t("settings.account.profile.changeStatus")}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <AccountInfoTile label={t("settings.account.fields.displayName")} value={visibleName} />
        <AccountInfoTile
          action={
            <button
              aria-label={t("settings.account.copy.username")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-app-soft transition hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={() => copyAccountValue(account.username)}
              type="button"
            >
              <Copy className="h-4 w-4" />
            </button>
          }
          label={t("common.username")}
          value={`@${account.username}`}
        />
        <AccountInfoTile
          action={
            <button
              aria-label={t("settings.account.copy.email")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-app-soft transition hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={() => copyAccountValue(account.email)}
              type="button"
            >
              <Copy className="h-4 w-4" />
            </button>
          }
          label={t("common.email")}
          value={account.email}
        />
        <AccountInfoTile
          action={<ChevronRight className="h-4 w-4 shrink-0 text-app-soft" />}
          label={t("settings.account.fields.status")}
          value={
            <span className="inline-flex items-center gap-2">
              <StatusDot status={account.status} />
              {statusLabel}
            </span>
          }
        />
      </div>

      <div className="mt-6 rounded-[24px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.76)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-extrabold text-app-foreground">
            {t("settings.account.completion.title")}
          </p>
          <span className="text-sm font-black text-[hsl(var(--primary))]">
            %{completion.percent}
          </span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[hsl(var(--surface-soft)/0.82)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--primary)/0.58))] shadow-[0_10px_24px_hsl(var(--primary)/0.2)] transition-all"
            style={{ width: `${completion.percent}%` }}
          />
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium leading-5 text-app-muted">
            {t("settings.account.completion.description")}
          </p>
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] px-4 text-xs font-black text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={onEdit}
            type="button"
          >
            {t("settings.account.completion.action")}
          </button>
        </div>
      </div>
    </section>
  );
}

function ProfilePhotoCard({
  account,
  onAvatarUpdated,
  t,
  uploadthingEnabled,
}: {
  account: AccountSettingsState;
  onAvatarUpdated: (account: AccountSettingsState) => void;
  t: (key: string, values?: Record<string, number | string>) => string;
  uploadthingEnabled: boolean;
}) {
  return (
    <section className="rounded-[32px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.92)] p-5 shadow-[0_20px_60px_hsl(var(--shadow-color)/0.08)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <Camera className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-app-foreground">
            {t("settings.account.avatar.title")}
          </h3>
          <p className="mt-1 text-sm leading-6 text-app-muted">
            {t("settings.account.avatar.description")}
          </p>
        </div>
      </div>
      <div className="mt-5">
        <ProfileAvatarField
          account={account}
          onAvatarUpdated={onAvatarUpdated}
          uploadthingEnabled={uploadthingEnabled}
        />
      </div>
    </section>
  );
}

function SuggestionRow({
  description,
  disabled,
  icon: Icon,
  note,
  status,
  title,
}: {
  description: string;
  disabled?: boolean;
  icon: LucideIcon;
  note?: string;
  status: ReactNode;
  title: string;
}) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "flex items-center gap-3 rounded-[22px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface)/0.76)] p-3 transition",
        disabled ? "opacity-72" : "hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--primary)/0.06)]",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-app-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
        {note ? <p className="mt-2 text-xs font-semibold text-app-soft">{note}</p> : null}
      </div>
      {status}
    </div>
  );
}

function SecurityCenterCard({
  account,
  t,
}: {
  account: AccountSettingsState;
  t: (key: string, values?: Record<string, number | string>) => string;
}) {
  return (
    <section className="rounded-[32px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.92)] p-5 shadow-[0_20px_60px_hsl(var(--shadow-color)/0.08)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-500">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-app-foreground">
            {t("settings.account.security.title")}
          </h3>
          <p className="mt-1 text-sm leading-6 text-app-muted">
            {t("settings.account.security.description")}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <SuggestionRow
          description={t("settings.account.quickSuggestions.email.description")}
          icon={Mail}
          status={
            account.emailVerified ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <Badge tone="muted">{t("settings.account.security.emailUnverified")}</Badge>
            )
          }
          title={t("settings.account.quickSuggestions.email.title")}
        />
        <SuggestionRow
          description={t("settings.account.quickSuggestions.twoFactor.description")}
          disabled
          icon={LockKeyhole}
          note={t("settings.account.security.backendRequired")}
          status={
            account.twoFactorEnabled ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <Badge tone="muted">{t("settings.account.previewSoon")}</Badge>
            )
          }
          title={t("settings.account.quickSuggestions.twoFactor.title")}
        />
        <SuggestionRow
          description={t("settings.account.quickSuggestions.recoveryCodes.description")}
          disabled
          icon={KeyRound}
          note={t("settings.account.security.backendRequired")}
          status={<Badge tone="muted">{t("settings.account.previewSoon")}</Badge>}
          title={t("settings.account.quickSuggestions.recoveryCodes.title")}
        />
        <SuggestionRow
          description={t("settings.account.security.sessions.description")}
          disabled
          icon={MonitorUp}
          note={t("settings.account.security.sessions.note")}
          status={<Badge tone="muted">{t("settings.account.preview")}</Badge>}
          title={t("settings.account.security.sessions.title")}
        />
        <SuggestionRow
          description={t("settings.account.security.export.description")}
          disabled
          icon={ExternalLink}
          note={t("settings.account.security.export.note")}
          status={<Badge tone="muted">{t("settings.account.preview")}</Badge>}
          title={t("settings.account.security.export.title")}
        />
      </div>

      <button
        className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-2xl px-3 text-sm font-black text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled
        type="button"
      >
        {t("settings.account.quickSuggestions.securityLink")}
        <ExternalLink className="h-4 w-4" />
      </button>
    </section>
  );
}

function AccountPreferenceRow({
  description,
  icon: Icon,
  preview = false,
  previewLabel,
  title,
  value,
  onClick,
}: {
  description: string;
  icon: LucideIcon;
  onClick?: () => void;
  preview?: boolean;
  previewLabel?: string;
  title: string;
  value: string;
}) {
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-app-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-app-muted">{description}</span>
      </span>
      <span className="flex min-w-0 shrink-0 items-center gap-2 text-right text-xs font-black text-app-muted sm:text-sm">
        <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{value}</span>
        {preview && previewLabel ? <Badge tone="muted">{previewLabel}</Badge> : null}
        <ChevronRight className="h-4 w-4 shrink-0 text-app-soft" />
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        className="flex w-full items-center gap-3 rounded-[22px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface)/0.76)] p-3 text-left transition hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--primary)/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface)/0.76)] p-3">
      {content}
    </div>
  );
}

function AccountPreferenceSelectRow<TValue extends string>({
  description,
  disabled = false,
  icon: Icon,
  labelForValue,
  onChange,
  options,
  title,
  value,
}: {
  description: string;
  disabled?: boolean;
  icon: LucideIcon;
  labelForValue: (value: TValue) => string;
  onChange: (value: TValue) => void;
  options: readonly TValue[];
  title: string;
  value: TValue;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface)/0.76)] p-3 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-app-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-app-muted">{description}</span>
      </span>
      <select
        aria-label={title}
        className="min-h-11 w-full rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.92)] px-3 text-sm font-bold text-app-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-[13.5rem]"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as TValue)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labelForValue(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

function PrivacyVisibilityCard({
  dmPolicy,
  disabled,
  friendRequestPolicy,
  onDmPolicyChange,
  onFriendRequestPolicyChange,
  t,
}: {
  disabled: boolean;
  dmPolicy: DmPolicyValue;
  friendRequestPolicy: FriendRequestPolicyValue;
  onDmPolicyChange: (policy: DmPolicyValue) => void;
  onFriendRequestPolicyChange: (policy: FriendRequestPolicyValue) => void;
  t: (key: string, values?: Record<string, number | string>) => string;
}) {
  return (
    <section className="rounded-[32px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.92)] p-5 shadow-[0_20px_60px_hsl(var(--shadow-color)/0.08)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-app-foreground">
            {t("settings.account.privacy.title")}
          </h3>
          <p className="mt-1 text-sm leading-6 text-app-muted">
            {t("settings.account.privacy.description")}
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <AccountPreferenceRow
          description={t("settings.account.privacy.profile.description")}
          icon={Eye}
          preview
          previewLabel={t("settings.account.preview")}
          title={t("settings.account.privacy.profile.title")}
          value={t("settings.account.visibility.everyone")}
        />
        <AccountPreferenceRow
          description={t("settings.account.privacy.online.description")}
          icon={UserRound}
          preview
          previewLabel={t("settings.account.preview")}
          title={t("settings.account.privacy.online.title")}
          value={t("settings.account.visibility.everyone")}
        />
        <AccountPreferenceSelectRow
          description={t("settings.account.privacy.dm.description")}
          disabled={disabled}
          icon={MessageCircle}
          labelForValue={(value) => t(getDmPolicyLabelKey(value))}
          onChange={onDmPolicyChange}
          options={DM_POLICY_OPTIONS}
          title={t("settings.account.privacy.dmPolicy.title")}
          value={dmPolicy}
        />
        <AccountPreferenceSelectRow
          description={t("settings.account.privacy.friendRequests.description")}
          disabled={disabled}
          icon={UserRound}
          labelForValue={(value) => t(getFriendRequestPolicyLabelKey(value))}
          onChange={onFriendRequestPolicyChange}
          options={FRIEND_REQUEST_POLICY_OPTIONS}
          title={t("settings.account.privacy.friendRequests.title")}
          value={friendRequestPolicy}
        />
      </div>
    </section>
  );
}

function AccountPreferencesCard({
  locale,
  onOpenLanguageSettings,
  t,
  timeZoneLabel,
}: {
  locale: "en" | "tr";
  onOpenLanguageSettings: () => void;
  t: (key: string, values?: Record<string, number | string>) => string;
  timeZoneLabel: string;
}) {
  return (
    <section className="rounded-[32px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.92)] p-5 shadow-[0_20px_60px_hsl(var(--shadow-color)/0.08)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <Globe2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-app-foreground">
            {t("settings.account.preferences.title")}
          </h3>
          <p className="mt-1 text-sm leading-6 text-app-muted">
            {t("settings.account.preferences.description")}
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <AccountPreferenceRow
          description={t("settings.account.preferences.timeZone.description")}
          icon={Clock3}
          preview
          previewLabel={t("settings.account.preview")}
          title={t("settings.account.preferences.timeZone.title")}
          value={timeZoneLabel}
        />
        <AccountPreferenceRow
          description={t("settings.account.preferences.language.description")}
          icon={Languages}
          onClick={onOpenLanguageSettings}
          title={t("settings.account.preferences.language.title")}
          value={getLocaleDisplayName(locale)}
        />
        <AccountPreferenceRow
          description={t("settings.account.preferences.dateFormat.description")}
          icon={CalendarDays}
          preview
          previewLabel={t("settings.account.preview")}
          title={t("settings.account.preferences.dateFormat.title")}
          value={t("settings.account.preferences.dateFormat.value")}
        />
        <AccountPreferenceRow
          description={t("settings.account.preferences.accessibility.description")}
          icon={Accessibility}
          preview
          previewLabel={t("settings.account.preview")}
          title={t("settings.account.preferences.accessibility.title")}
          value={t("settings.account.preferences.accessibility.value")}
        />
      </div>
    </section>
  );
}

export function SettingsPanel({
  buildInfo,
  initialAccount,
  uploadthingEnabled,
}: SettingsPanelProps) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { panel, section } = resolveSettingsSelection(searchParams);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [accountState, setAccountState] = useState(initialAccount);
  const [accountDraft, setAccountDraft] = useState(initialAccount);
  const [accountFeedback, setAccountFeedback] = useState<{
    tone: "error" | "success";
    value: string;
  } | null>(null);
  const [iconFeedbackVisible, setIconFeedbackVisible] = useState(false);
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const [browserTimeZone, setBrowserTimeZone] = useState("Europe/Istanbul");
  const [accountFieldErrors, setAccountFieldErrors] = useState<
    Partial<Record<AccountField, string>>
  >({});
  const [isSavingAccount, startSavingAccount] = useTransition();
  const {
    applyPersistedSettings,
    appIconId,
    channelSidebarWidth,
    desktopCloseToTrayEnabled,
    desktopNotificationPreviews,
    desktopRichPresenceEnabled,
    desktopStreamerModeEnabled,
    mainPanelWidth,
    messageFont,
    notificationAutoClose,
    notificationLimit,
    notificationPopupTimeoutSeconds,
    resetChannelSidebarWidth,
    resetMainPanelWidth,
    setAppIconId,
    setChannelSidebarWidth,
    setDesktopCloseToTrayEnabled,
    setDesktopNotificationPreviews,
    setDesktopRichPresenceEnabled,
    setDesktopStreamerModeEnabled,
    setMainPanelWidth,
    setMessageFont,
    setNotificationAutoClose,
    setNotificationLimit,
    setNotificationPopupTimeoutSeconds,
  } = useAppStore(
    useShallow((state) => ({
      applyPersistedSettings: state.applyPersistedSettings,
      appIconId: state.appIconId,
      channelSidebarWidth: state.channelSidebarWidth,
      desktopCloseToTrayEnabled: state.desktopCloseToTrayEnabled,
      desktopNotificationPreviews: state.desktopNotificationPreviews,
      desktopRichPresenceEnabled: state.desktopRichPresenceEnabled,
      desktopStreamerModeEnabled: state.desktopStreamerModeEnabled,
      mainPanelWidth: state.mainPanelWidth,
      messageFont: state.messageFont,
      notificationAutoClose: state.notificationAutoClose,
      notificationLimit: state.notificationLimit,
      notificationPopupTimeoutSeconds: state.notificationPopupTimeoutSeconds,
      resetChannelSidebarWidth: state.resetChannelSidebarWidth,
      resetMainPanelWidth: state.resetMainPanelWidth,
      setAppIconId: state.setAppIconId,
      setChannelSidebarWidth: state.setChannelSidebarWidth,
      setDesktopCloseToTrayEnabled: state.setDesktopCloseToTrayEnabled,
      setDesktopNotificationPreviews: state.setDesktopNotificationPreviews,
      setDesktopRichPresenceEnabled: state.setDesktopRichPresenceEnabled,
      setDesktopStreamerModeEnabled: state.setDesktopStreamerModeEnabled,
      setMainPanelWidth: state.setMainPanelWidth,
      setMessageFont: state.setMessageFont,
      setNotificationAutoClose: state.setNotificationAutoClose,
      setNotificationLimit: state.setNotificationLimit,
      setNotificationPopupTimeoutSeconds: state.setNotificationPopupTimeoutSeconds,
    })),
  );
  const {
    notificationVolume,
    setNotificationVolume,
    setVoiceJoinEnabled,
    setVoiceJoinSoundFile,
    setVoiceJoinVolume,
    setVoiceLeaveEnabled,
    setVoiceLeaveSoundFile,
    setVoiceLeaveVolume,
    voiceJoinEnabled,
    voiceJoinSoundFile,
    voiceJoinVolume,
    voiceLeaveEnabled,
    voiceLeaveSoundFile,
    voiceLeaveVolume,
  } = useSoundStore(
    useShallow((state) => ({
      notificationVolume: state.notificationVolume,
      setNotificationVolume: state.setNotificationVolume,
      setVoiceJoinEnabled: state.setVoiceJoinEnabled,
      setVoiceJoinSoundFile: state.setVoiceJoinSoundFile,
      setVoiceJoinVolume: state.setVoiceJoinVolume,
      setVoiceLeaveEnabled: state.setVoiceLeaveEnabled,
      setVoiceLeaveSoundFile: state.setVoiceLeaveSoundFile,
      setVoiceLeaveVolume: state.setVoiceLeaveVolume,
      voiceJoinEnabled: state.voiceJoinEnabled,
      voiceJoinSoundFile: state.voiceJoinSoundFile,
      voiceJoinVolume: state.voiceJoinVolume,
      voiceLeaveEnabled: state.voiceLeaveEnabled,
      voiceLeaveSoundFile: state.voiceLeaveSoundFile,
      voiceLeaveVolume: state.voiceLeaveVolume,
    })),
  );

  useEffect(() => {
    if (!iconFeedbackVisible) {
      return;
    }

    const timer = setTimeout(() => {
      setIconFeedbackVisible(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [iconFeedbackVisible]);

  const handleAppIconChange = useCallback(
    (nextIconId: AppIconId) => {
      setAppIconId(nextIconId);
      setIconFeedbackVisible(true);
    },
    [setAppIconId],
  );

  useEffect(() => {
    setAccountState(initialAccount);
    setAccountDraft(initialAccount);
  }, [initialAccount]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });

    const settingsScrollRoot = document.querySelector<HTMLElement>("[data-settings-scroll-root]");
    settingsScrollRoot?.scrollTo({ left: 0, top: 0 });
  }, [panel, section]);

  useEffect(() => {
    setIsDesktopRuntime(isWhisprDesktopRuntime());
  }, []);

  useEffect(() => {
    try {
      const nextTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (nextTimeZone) {
        setBrowserTimeZone(nextTimeZone);
      }
    } catch {
      setBrowserTimeZone("Europe/Istanbul");
    }
  }, []);

  const settingsQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      applyPersistedSettings(settingsQuery.data);
    }
  }, [applyPersistedSettings, settingsQuery.data]);

  const patchSettingsMutation = useMutation({
    mutationFn: (patch: Partial<UserLayoutSettings>) => patchLayoutSettings(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.layout });
      const previous =
        queryClient.getQueryData<UserLayoutSettings>(settingsQueryKeys.layout) ?? null;

      if (previous) {
        const next = { ...previous, ...patch };
        queryClient.setQueryData(settingsQueryKeys.layout, next);
        applyPersistedSettings(next);
      }

      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.layout, context.previous);
        applyPersistedSettings(context.previous);
      }
    },
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(settingsQueryKeys.layout, nextSettings);
      applyPersistedSettings(nextSettings);
    },
  });

  const serverSettings = settingsQuery.data;

  const updateServerSettings = useCallback(
    (patch: Partial<UserLayoutSettings>) => {
      patchSettingsMutation.mutate(patch);
    },
    [patchSettingsMutation],
  );

  const selectedMessageFont = normalizeMessageFontId(serverSettings?.messageFont ?? messageFont);

  const handleMessageFontChange = useCallback(
    (nextFont: MessageFontId) => {
      const normalizedFont = normalizeMessageFontId(nextFont);
      setMessageFont(normalizedFont);
      queryClient.setQueryData<UserLayoutSettings | undefined>(
        settingsQueryKeys.layout,
        (current) => (current ? { ...current, messageFont: normalizedFont } : current),
      );
    },
    [queryClient, setMessageFont],
  );

  const previewSound = useCallback(
    (effect: SoundEffectKey, volume: number, profile: SoundProfileKey) => {
      const audio = new Audio(resolveSoundEffectPath(effect, profile));
      audio.volume = Math.min(1, Math.max(0, volume / 100));
      audio.play().catch(() => {
        // The preview is user-triggered, but browsers may still reject playback.
      });
    },
    [],
  );

  const handleMainCanvasWidthChange = useCallback(
    (nextValue: number) => {
      setMainPanelWidth(nextValue);
    },
    [setMainPanelWidth],
  );

  const handleChannelSidebarWidthChange = useCallback(
    (nextValue: number) => {
      void queryClient.cancelQueries({ queryKey: settingsQueryKeys.layout });
      setChannelSidebarWidth(nextValue);
      queryClient.setQueryData<UserLayoutSettings | undefined>(
        settingsQueryKeys.layout,
        (current) => (current ? { ...current, channelSidebarWidth: nextValue } : current),
      );
    },
    [queryClient, setChannelSidebarWidth],
  );

  const handleNotificationLimitChange = useCallback(
    (nextValue: number) => {
      void queryClient.cancelQueries({ queryKey: settingsQueryKeys.layout });
      setNotificationLimit(nextValue);
      queryClient.setQueryData<UserLayoutSettings | undefined>(
        settingsQueryKeys.layout,
        (current) => (current ? { ...current, notificationLimit: nextValue } : current),
      );
    },
    [queryClient, setNotificationLimit],
  );

  const handleNotificationAutoCloseChange = useCallback(
    (nextValue: boolean) => {
      void queryClient.cancelQueries({ queryKey: settingsQueryKeys.layout });
      setNotificationAutoClose(nextValue);
      queryClient.setQueryData<UserLayoutSettings | undefined>(
        settingsQueryKeys.layout,
        (current) => (current ? { ...current, notificationAutoClose: nextValue } : current),
      );
    },
    [queryClient, setNotificationAutoClose],
  );

  const soundProfileOptions = useMemo(
    () =>
      SOUND_PROFILE_OPTIONS.map((option) => ({
        label: t(`settings.notifications.soundProfile.${option}`),
        value: option,
      })),
    [t],
  );
  const notificationSoundFile = isSoundProfileKey(serverSettings?.notificationSoundFile)
    ? serverSettings.notificationSoundFile
    : DEFAULT_SOUND_EFFECT_PROFILES.notification;

  const accountStatusOptions = useMemo(
    () => [
      { key: "friends.status.online", value: UserStatus.ONLINE },
      { key: "friends.status.idle", value: UserStatus.IDLE },
      { key: "friends.status.dnd", value: UserStatus.DND },
      { key: "friends.status.offline", value: UserStatus.OFFLINE },
      { key: "settings.account.status.invisible", value: UserStatus.INVISIBLE },
    ],
    [],
  );

  const openPanel = (targetPanel: SettingsPanelKey) => {
    router.push(buildSettingsHref("appearance", targetPanel));
  };

  const handleAccountDraftChange = <TField extends keyof AccountSettingsState>(
    field: TField,
    value: AccountSettingsState[TField],
  ) => {
    setAccountDraft((current) => ({ ...current, [field]: value }));
    setAccountFieldErrors((current) => ({ ...current, [field]: undefined }));
    setAccountFeedback(null);
  };

  const cancelAccountEditing = () => {
    setAccountDraft(accountState);
    setAccountFieldErrors({});
    setAccountFeedback(null);
    setIsEditingAccount(false);
  };

  const saveAccount = () => {
    startSavingAccount(async () => {
      const result = (await updateAccountSettingsAction(
        accountDraft,
      )) as UpdateAccountSettingsResult;

      if (!result.success || !result.user) {
        setAccountFieldErrors(result.fieldErrors ?? {});
        setAccountFeedback({
          tone: "error",
          value: t(result.error ?? "settings.account.errors.save"),
        });
        return;
      }

      setAccountState(result.user);
      setAccountDraft(result.user);
      window.dispatchEvent(
        new CustomEvent("whispr:account-updated", {
          detail: result.user,
        }),
      );
      setAccountFieldErrors({});
      setAccountFeedback({
        tone: "success",
        value: t("settings.account.saved"),
      });
      setIsEditingAccount(false);
    });
  };

  const handleAvatarUpdated = (nextAccount: AccountSettingsState) => {
    setAccountState(nextAccount);
    setAccountDraft((current) => ({
      ...current,
      avatarUrl: nextAccount.avatarUrl,
    }));
    setAccountFeedback({
      tone: "success",
      value: t("settings.account.avatar.saved"),
    });
  };

  const renderAccountSection = () => {
    const visibleName = accountState.displayName?.trim() || accountState.username;
    const statusLabel = t(getAccountStatusLabelKey(accountState.status));
    const completion = getProfileCompletionSummary({
      avatarUrl: accountState.avatarUrl,
      displayName: accountState.displayName,
      email: accountState.email,
      emailVerified: accountState.emailVerified,
      username: accountState.username,
    });
    const timeZoneLabel = getBrowserTimeZoneLabel(browserTimeZone, locale);
    const dmPolicy = serverSettings?.dmPolicy ?? "FRIENDS";
    const friendRequestPolicy = serverSettings?.friendRequestPolicy ?? "EVERYONE";

    return (
      <div className="space-y-6">
        <AccountPageHeader
          description={t("settings.account.pageDescription")}
          eyebrow={t("settings.account.badge")}
          title={t("settings.account.title")}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            <ProfileSummaryCard
              account={accountState}
              completion={completion}
              onChangeStatus={() => setIsEditingAccount(true)}
              onEdit={() => setIsEditingAccount(true)}
              statusLabel={statusLabel}
              t={t}
              visibleName={visibleName}
            />

            {accountFeedback ? (
              <div
                className={cn(
                  "rounded-[24px] border p-4 text-sm font-semibold shadow-[0_16px_40px_hsl(var(--shadow-color)/0.06)]",
                  accountFeedback.tone === "success"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
                    : "border-rose-500/25 bg-rose-500/10 text-rose-600",
                )}
              >
                {accountFeedback.value}
              </div>
            ) : null}

            {isEditingAccount ? (
              <SettingCard
                description={t("settings.account.editDescription")}
                icon={Mail}
                title={t("settings.account.editTitle")}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-app-foreground">
                      {t("settings.account.fields.displayName")}
                    </span>
                    <input
                      className="app-panel w-full rounded-2xl border px-4 py-3 text-sm font-semibold text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                      onChange={(event) =>
                        handleAccountDraftChange("displayName", event.target.value)
                      }
                      type="text"
                      value={accountDraft.displayName ?? ""}
                    />
                    {accountFieldErrors.displayName ? (
                      <p className="mt-2 text-xs font-semibold text-app-danger">
                        {t(accountFieldErrors.displayName)}
                      </p>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-app-foreground">
                      {t("common.username")}
                    </span>
                    <input
                      className="app-panel w-full rounded-2xl border px-4 py-3 text-sm font-semibold text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                      onChange={(event) =>
                        handleAccountDraftChange("username", event.target.value)
                      }
                      type="text"
                      value={accountDraft.username}
                    />
                    {accountFieldErrors.username ? (
                      <p className="mt-2 text-xs font-semibold text-app-danger">
                        {t(accountFieldErrors.username)}
                      </p>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-app-foreground">
                      {t("common.email")}
                    </span>
                    <input
                      className="app-panel w-full rounded-2xl border px-4 py-3 text-sm font-semibold text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                      onChange={(event) => handleAccountDraftChange("email", event.target.value)}
                      type="email"
                      value={accountDraft.email}
                    />
                    {accountFieldErrors.email ? (
                      <p className="mt-2 text-xs font-semibold text-app-danger">
                        {t(accountFieldErrors.email)}
                      </p>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-app-foreground">
                      {t("settings.account.fields.status")}
                    </span>
                    <select
                      className="app-panel w-full rounded-2xl border px-4 py-3 text-sm font-semibold text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                      onChange={(event) =>
                        handleAccountDraftChange("status", event.target.value as UserStatus)
                      }
                      value={accountDraft.status}
                    >
                      {accountStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.key)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={cancelAccountEditing}
                    type="button"
                    variant="outline"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={isSavingAccount}
                    onClick={saveAccount}
                    type="button"
                  >
                    {isSavingAccount ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </SettingCard>
            ) : null}

            <PrivacyVisibilityCard
              disabled={patchSettingsMutation.isPending}
              dmPolicy={dmPolicy}
              friendRequestPolicy={friendRequestPolicy}
              onDmPolicyChange={(nextPolicy) => updateServerSettings({ dmPolicy: nextPolicy })}
              onFriendRequestPolicyChange={(nextPolicy) =>
                updateServerSettings({ friendRequestPolicy: nextPolicy })
              }
              t={t}
            />
            <AccountPreferencesCard
              locale={locale}
              onOpenLanguageSettings={() => openPanel("language")}
              t={t}
              timeZoneLabel={timeZoneLabel}
            />
          </div>

          <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <ProfilePhotoCard
              account={accountState}
              onAvatarUpdated={handleAvatarUpdated}
              t={t}
              uploadthingEnabled={uploadthingEnabled}
            />
            <SecurityCenterCard account={accountState} t={t} />
          </div>
        </div>
      </div>
    );
  };

  const renderVoiceSection = () => {
    const showAudio = panel === null || panel === "audio";
    const showCamera = panel === null || panel === "camera";
    const showScreenShare = panel === null || panel === "screenShare";

    return (
      <div className="space-y-6">
        <SectionHero
          badge={t("settings.groups.voiceVideo.badge")}
          description={t("settings.groups.voiceVideo.description")}
          title={t("settings.groups.voiceVideo.title")}
        />

        {isDesktopRuntime ? (
          <SettingCard
            description={t("settings.voice.desktopPermissions.description")}
            icon={MonitorUp}
            title={t("settings.voice.desktopPermissions.title")}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <InfoPill
                label={t("settings.voice.desktopPermissions.microphone.label")}
                value={t("settings.voice.desktopPermissions.microphone.value")}
              />
              <InfoPill
                label={t("settings.voice.desktopPermissions.camera.label")}
                value={t("settings.voice.desktopPermissions.camera.value")}
              />
              <InfoPill
                label={t("settings.voice.desktopPermissions.screenShare.label")}
                value={t("settings.voice.desktopPermissions.screenShare.value")}
              />
              <InfoPill
                label={t("settings.voice.desktopPermissions.cleanup.label")}
                value={t("settings.voice.desktopPermissions.cleanup.value")}
              />
            </div>
          </SettingCard>
        ) : null}

        {showAudio ? <VoicePreferencesPanel /> : null}

        {showCamera ? (
          <SettingCard
            badge={t("settings.voice.camera.badge")}
            description={t("settings.voice.camera.description")}
            icon={Camera}
            title={t("settings.voice.camera.title")}
          >
            <CameraPreferencesPanel />
          </SettingCard>
        ) : null}

        {showScreenShare ? (
          <SettingCard
            badge={t("settings.voice.screenShare.badge")}
            description={t("settings.voice.screenShare.description")}
            icon={MonitorUp}
            title={t("settings.voice.screenShare.title")}
          >
            <ScreenSharePreferencesPanel />
          </SettingCard>
        ) : null}
      </div>
    );
  };

  const renderAdvancedControls = (
    target: "all" | "appIcon" | "serverRail" | "mainCanvas" | "channelSidebar",
  ) => {
    const showAppIcon = target === "all" || target === "appIcon";
    const showServerRail = target === "all" || target === "serverRail";
    const showMainCanvas = target === "all" || target === "mainCanvas";
    const showChannelSidebar = target === "all" || target === "channelSidebar";

    return (
      <div className="space-y-6">
        <SettingCard
          description={t("settings.appearance.advanced.description")}
          icon={LayoutPanelTop}
          title={t("settings.appearance.advanced.title")}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoPill
              label={t("settings.appearance.icons.title")}
              value={t("settings.appearance.icons.description")}
            />
            <InfoPill
              label={t("settings.appearance.advanced.serverRailTitle")}
              value={t("settings.appearance.advanced.serverRailDescription")}
            />
            <InfoPill
              label={t("settings.appearance.advanced.mainCanvasTitle")}
              value={t("settings.appearance.advanced.mainCanvasDescription")}
            />
            <InfoPill
              label={t("settings.appearance.advanced.channelSidebarTitle")}
              value={t("settings.appearance.advanced.channelSidebarDescription")}
            />
          </div>
        </SettingCard>

        {showAppIcon ? (
          <SettingCard
            description={t("settings.appearance.icons.description")}
            icon={ImageIcon}
            title={t("settings.appearance.icons.title")}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {APP_ICON_OPTIONS.map((icon) => {
                const selected = appIconId === icon.id;

                return (
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "group min-w-0 rounded-[24px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      selected
                        ? "border-[hsl(var(--primary)/0.55)] bg-[hsl(var(--primary)/0.12)] shadow-[0_18px_42px_hsl(var(--shadow-color)/0.1)]"
                        : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.28)] hover:border-[hsl(var(--primary)/0.34)] hover:bg-[hsl(var(--surface-soft)/0.48)]",
                    )}
                    data-selected={selected ? "true" : "false"}
                    data-testid={`app-icon-option-${icon.id}`}
                    key={icon.id}
                    onClick={() => handleAppIconChange(icon.id)}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-[hsl(var(--border)/0.65)] bg-[linear-gradient(145deg,hsl(var(--surface-card)),hsl(var(--surface-soft)/0.44))] p-2 shadow-inner">
                        <Image
                          alt=""
                          className="h-11 w-11 object-contain transition group-hover:scale-105"
                          height={44}
                          src={icon.src}
                          width={44}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-app-foreground">
                          {t(icon.labelKey)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-app-muted">
                          {selected
                            ? t("settings.appearance.icons.selected")
                            : t("settings.appearance.icons.select")}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {iconFeedbackVisible ? (
              <div
                className="mt-4 rounded-[22px] border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.08)] px-4 py-3 text-sm text-[hsl(var(--success))]"
                data-testid="app-icon-feedback"
              >
                <p className="font-semibold">{t("settings.appearance.icons.updated")}</p>
                <p className="mt-1 leading-6 text-app-muted">
                  {t("settings.appearance.icons.updatedDescription")}
                </p>
              </div>
            ) : null}
          </SettingCard>
        ) : null}

        {showServerRail ? (
          <CompactServerRailPreview
            description={t("appearance.serverRail.title")}
            iconLabel={t("appearance.serverRail.iconMetric")}
            modeLabel={t("appearance.serverRail.compactMode")}
            targetLabel={t("appearance.serverRail.touchMetric")}
            title={t("settings.appearance.advanced.serverRailTitle")}
            widthLabel={t("appearance.serverRail.widthMetric")}
          />
        ) : null}

        {showMainCanvas ? (
          <RangeSliderCard
            description={t("appearance.canvas.description")}
            labels={[
              t("appearance.canvas.compact"),
              t("appearance.canvas.balanced"),
              t("appearance.canvas.immersive"),
            ]}
            max={MAX_MAIN_PANEL_WIDTH}
            min={MIN_MAIN_PANEL_WIDTH}
            onChange={handleMainCanvasWidthChange}
            preview={
              <div className="app-panel-soft rounded-[24px] border p-4">
                <div className="mx-auto flex max-w-full justify-center">
                  <div
                    className="rounded-[24px] border border-[hsl(var(--border)/0.74)] bg-[linear-gradient(160deg,hsl(var(--surface-card)/0.9),hsl(var(--surface-soft)/0.34))] p-4 shadow-[0_18px_42px_hsl(var(--shadow-color)/0.08)]"
                    style={{ width: `${Math.min(mainPanelWidth, 520)}px` }}
                  >
                    <div className="h-4 w-32 rounded-full bg-[hsl(var(--surface-soft))]" />
                    <div className="mt-3 h-24 rounded-[18px] bg-[hsl(var(--surface-soft)/0.82)]" />
                    <div className="mt-3 flex gap-3">
                      <div className="h-3 flex-1 rounded-full bg-[hsl(var(--surface-soft)/0.72)]" />
                      <div className="h-3 w-24 rounded-full bg-[hsl(var(--surface-soft)/0.58)]" />
                    </div>
                  </div>
                </div>
              </div>
            }
            step={MAIN_PANEL_WIDTH_STEP}
            testId="settings-main-canvas-width"
            title={t("settings.appearance.advanced.mainCanvasTitle")}
            value={mainPanelWidth}
          />
        ) : null}

        {showChannelSidebar ? (
          <RangeSliderCard
            description={t("appearance.sidebar.title")}
            labels={[
              t("appearance.sidebar.compact"),
              t("appearance.sidebar.readable"),
              t("appearance.sidebar.studio"),
            ]}
            max={MAX_CHANNEL_SIDEBAR_WIDTH}
            min={MIN_CHANNEL_SIDEBAR_WIDTH}
            onChange={handleChannelSidebarWidthChange}
            preview={
              <div className="app-panel-soft rounded-[24px] border p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="app-panel-soft shrink-0 rounded-[22px] border p-3"
                    style={{
                      width: `${COMPACT_SERVER_RAIL_WIDTH}px`,
                    }}
                  >
                    <div
                      className="mx-auto rounded-[16px] bg-[hsl(var(--primary)/0.18)]"
                      style={{
                        height: COMPACT_SERVER_RAIL_ICON_SIZE,
                        width: COMPACT_SERVER_RAIL_ICON_SIZE,
                      }}
                    />
                  </div>
                  <div
                    className="app-panel shrink-0 rounded-[24px] border p-4"
                    style={{ width: `min(${channelSidebarWidth}px, 52vw)` }}
                  >
                    <div className="h-4 w-36 rounded-full bg-[hsl(var(--surface-soft))]" />
                    <div className="mt-3 h-3 w-44 rounded-full bg-[hsl(var(--surface-soft)/0.8)]" />
                    <div className="mt-3 h-3 w-32 rounded-full bg-[hsl(var(--surface-soft)/0.72)]" />
                  </div>
                </div>
              </div>
            }
            step={CHANNEL_SIDEBAR_WIDTH_STEP}
            testId="settings-channel-sidebar-width"
            title={t("settings.appearance.advanced.channelSidebarTitle")}
            value={channelSidebarWidth}
          />
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            disabled={
              channelSidebarWidth === DEFAULT_CHANNEL_SIDEBAR_WIDTH &&
              mainPanelWidth === DEFAULT_MAIN_PANEL_WIDTH
            }
            onClick={() => {
              resetChannelSidebarWidth();
              resetMainPanelWidth();
            }}
            data-testid="settings-layout-reset"
            type="button"
            variant="outline"
          >
            {t("appearance.resetLayout")}
          </Button>
        </div>
      </div>
    );
  };

  const renderMessageFontPicker = () => (
    <SettingCard
      badge={t("settings.appearance.messageFont.badge")}
      description={t("settings.appearance.messageFont.description")}
      icon={Type}
      title={t("settings.appearance.messageFont.title")}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {MESSAGE_FONT_OPTIONS.map((option) => {
          const isSelected = option.id === selectedMessageFont;

          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "group min-h-36 rounded-[24px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                isSelected
                  ? "border-[hsl(var(--primary)/0.48)] bg-[hsl(var(--primary)/0.12)] shadow-[0_18px_42px_hsl(var(--primary)/0.12)]"
                  : "border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.28)] hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--surface-card)/0.72)]",
              )}
              data-testid={`settings-message-font-${option.id}`}
              key={option.id}
              onClick={() => handleMessageFontChange(option.id)}
              style={{ fontFamily: option.family }}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-app-soft">
                  {option.label}
                </span>
                {isSelected ? (
                  <span className="rounded-full border border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.14)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[hsl(var(--primary))]">
                    {t("settings.appearance.messageFont.selected")}
                  </span>
                ) : null}
              </div>
              <p className="mt-5 text-2xl font-semibold tracking-tight text-app-foreground">
                {t("settings.appearance.messageFont.preview")}
              </p>
              <p className="mt-3 text-sm leading-6 text-app-muted">
                {t("settings.appearance.messageFont.sample")}
              </p>
            </button>
          );
        })}
      </div>
      <p className="mt-4 rounded-[20px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.28)] px-4 py-3 text-xs leading-5 text-app-muted">
        {t("settings.appearance.messageFont.note")}
      </p>
    </SettingCard>
  );

  const renderAppearanceSection = () => {
    return (
      <div className="space-y-6">
        <SectionHero
          badge={t("settings.groups.appearance.badge")}
          description={t("settings.groups.appearance.description")}
          title={t("settings.groups.appearance.title")}
        />

        {panel === null || panel === "language" ? (
          <SettingCard
            description={t("settings.appearance.language.description")}
            icon={Languages}
            title={t("settings.appearance.language.title")}
          >
            <LanguageSwitcher persistSelection showMeta variant="panel" />
          </SettingCard>
        ) : null}

        {panel === null || panel === "theme" ? (
          <SettingCard
            description={t("settings.appearance.theme.description")}
            icon={Sparkles}
            title={t("settings.appearance.theme.title")}
          >
            <ThemePicker persistSelection />
          </SettingCard>
        ) : null}

        {panel === null || panel === "messageFont" ? renderMessageFontPicker() : null}

        {panel === null ? (
          <SettingCard
            description={t("settings.appearance.advanced.description")}
            icon={LayoutPanelTop}
            title={t("settings.appearance.advanced.title")}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoPill
                  label={t("settings.appearance.icons.title")}
                  value={t("settings.appearance.icons.description")}
                />
                <InfoPill
                  label={t("settings.appearance.advanced.serverRailTitle")}
                  value={t("settings.appearance.advanced.serverRailDescription")}
                />
                <InfoPill
                  label={t("settings.appearance.advanced.mainCanvasTitle")}
                  value={t("settings.appearance.advanced.mainCanvasDescription")}
                />
                <InfoPill
                  label={t("settings.appearance.advanced.channelSidebarTitle")}
                  value={t("settings.appearance.advanced.channelSidebarDescription")}
                />
              </div>
              <Button onClick={() => openPanel("advanced")} type="button" variant="outline">
                {t("settings.appearance.advanced.open")}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </SettingCard>
        ) : null}

        {panel === "advanced" ? renderAdvancedControls("all") : null}
        {panel === "appIcon" ? renderAdvancedControls("appIcon") : null}
        {panel === "serverRail" ? renderAdvancedControls("serverRail") : null}
        {panel === "mainCanvas" ? renderAdvancedControls("mainCanvas") : null}
        {panel === "channelSidebar" ? renderAdvancedControls("channelSidebar") : null}
      </div>
    );
  };

  const renderNotificationsSection = () => {
    const showGeneral = panel === null || panel === "general";
    const showSounds = panel === null || panel === "sounds";

    return (
      <div className="space-y-6">
        <SectionHero
          badge={t("settings.groups.notifications.badge")}
          description={t("settings.groups.notifications.description")}
          title={t("settings.groups.notifications.title")}
        />

        {showGeneral ? (
          <SettingCard
            description={t("settings.notifications.general.description")}
            icon={BellRing}
            title={t("settings.notifications.general.title")}
          >
            <div className="space-y-4">
              <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="text-app-foreground text-sm font-medium">
                    {t("appearance.notifications.count")}
                  </label>
                  <div className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2">
                    <span className="text-app-foreground text-sm font-medium">
                      {notificationLimit}
                    </span>
                  </div>
                </div>
                <input
                  aria-label={t("appearance.notifications.count")}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))]"
                  data-testid="settings-notification-limit"
                  max={Math.max(...NOTIFICATION_LIMIT_OPTIONS)}
                  min={Math.min(...NOTIFICATION_LIMIT_OPTIONS)}
                  onChange={(event) => handleNotificationLimitChange(Number(event.target.value))}
                  step={1}
                  type="range"
                  value={notificationLimit}
                />
              </div>

              <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="text-app-foreground text-sm font-medium">
                    {t("appearance.notifications.duration")}
                  </label>
                  <div className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2">
                    <span className="text-app-foreground text-sm font-medium">
                      {notificationPopupTimeoutSeconds}s
                    </span>
                  </div>
                </div>
                <input
                  aria-label={t("appearance.notifications.duration")}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))]"
                  data-testid="settings-notification-duration"
                  max={MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS}
                  min={MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS}
                  onChange={(event) =>
                    setNotificationPopupTimeoutSeconds(Number(event.target.value))
                  }
                  step={NOTIFICATION_POPUP_TIMEOUT_STEP}
                  type="range"
                  value={notificationPopupTimeoutSeconds}
                />
                <p className="text-app-muted mt-4 text-xs leading-5">
                  {t("appearance.notifications.durationDesc")}
                </p>
              </div>

              <ToggleRow
                checked={notificationAutoClose}
                description={t("appearance.notifications.autoCloseDesc")}
                label={t("appearance.notifications.autoClose")}
                onChange={handleNotificationAutoCloseChange}
                testId="settings-notification-auto-close"
              />
              <ToggleRow
                checked={serverSettings?.desktopNotifications ?? true}
                description={t("settings.notifications.desktop.description")}
                label={t("settings.notifications.desktop.title")}
                onChange={(nextValue) => updateServerSettings({ desktopNotifications: nextValue })}
                testId="settings-desktop-notifications"
              />
              <ToggleRow
                checked={desktopNotificationPreviews}
                description={t("settings.notifications.desktopPreviews.description")}
                label={t("settings.notifications.desktopPreviews.title")}
                onChange={setDesktopNotificationPreviews}
                testId="settings-desktop-notification-previews"
              />
              {isDesktopRuntime ? (
                <>
                  <ToggleRow
                    checked={desktopCloseToTrayEnabled}
                    description={t("settings.notifications.closeToTray.description")}
                    label={t("settings.notifications.closeToTray.title")}
                    onChange={setDesktopCloseToTrayEnabled}
                    testId="settings-desktop-close-to-tray"
                  />
                  <ToggleRow
                    checked={desktopStreamerModeEnabled}
                    description={t("settings.notifications.streamerMode.description")}
                    label={t("settings.notifications.streamerMode.title")}
                    onChange={setDesktopStreamerModeEnabled}
                    testId="settings-desktop-streamer-mode"
                  />
                  <ToggleRow
                    checked={desktopRichPresenceEnabled}
                    description={t("settings.notifications.richPresence.description")}
                    label={t("settings.notifications.richPresence.title")}
                    onChange={setDesktopRichPresenceEnabled}
                    testId="settings-desktop-rich-presence"
                  />
                </>
              ) : null}
              <ToggleRow
                checked={serverSettings?.mobileNotifications ?? true}
                description={t("settings.notifications.mobile.description")}
                label={t("settings.notifications.mobile.title")}
                onChange={(nextValue) => updateServerSettings({ mobileNotifications: nextValue })}
                testId="settings-mobile-notifications"
              />
              <ToggleRow
                checked={serverSettings?.emailNotifications ?? false}
                description={t("settings.notifications.email.description")}
                label={t("settings.notifications.email.title")}
                onChange={(nextValue) => updateServerSettings({ emailNotifications: nextValue })}
                testId="settings-email-notifications"
              />
            </div>
          </SettingCard>
        ) : null}

        {showSounds ? (
          <SettingCard
            description={t("settings.notifications.sounds.description")}
            icon={Volume2}
            title={t("settings.notifications.sounds.title")}
          >
            <div className="space-y-4">
              <SoundVolumeRow
                checked={serverSettings?.notificationSound ?? true}
                description={t("settings.notifications.soundToggle.description")}
                label={t("settings.notifications.soundToggle.title")}
                onChange={(nextValue) => updateServerSettings({ notificationSound: nextValue })}
                onPreview={() =>
                  previewSound("notification", notificationVolume, notificationSoundFile)
                }
                onProfileChange={(nextValue) =>
                  updateServerSettings({ notificationSoundFile: nextValue })
                }
                onVolumeChange={setNotificationVolume}
                profileLabel={t("settings.notifications.soundProfile.title")}
                profileOptions={soundProfileOptions}
                profileValue={notificationSoundFile}
                previewLabel={t("settings.notifications.sound.preview")}
                testId="settings-notification-sound"
                volume={notificationVolume}
                volumeLabel={t("settings.notifications.sound.volume")}
              />
              <SoundVolumeRow
                checked={voiceJoinEnabled}
                description={t("settings.notifications.voiceJoinSound.description")}
                label={t("settings.notifications.voiceJoinSound.title")}
                onChange={setVoiceJoinEnabled}
                onPreview={() => previewSound("voiceJoin", voiceJoinVolume, voiceJoinSoundFile)}
                onProfileChange={setVoiceJoinSoundFile}
                onVolumeChange={setVoiceJoinVolume}
                profileLabel={t("settings.notifications.soundProfile.title")}
                profileOptions={soundProfileOptions}
                profileValue={voiceJoinSoundFile}
                previewLabel={t("settings.notifications.sound.preview")}
                testId="settings-voice-join-sound"
                volume={voiceJoinVolume}
                volumeLabel={t("settings.notifications.sound.volume")}
              />
              <SoundVolumeRow
                checked={voiceLeaveEnabled}
                description={t("settings.notifications.voiceLeaveSound.description")}
                label={t("settings.notifications.voiceLeaveSound.title")}
                onChange={setVoiceLeaveEnabled}
                onPreview={() => previewSound("voiceLeave", voiceLeaveVolume, voiceLeaveSoundFile)}
                onProfileChange={setVoiceLeaveSoundFile}
                onVolumeChange={setVoiceLeaveVolume}
                profileLabel={t("settings.notifications.soundProfile.title")}
                profileOptions={soundProfileOptions}
                profileValue={voiceLeaveSoundFile}
                previewLabel={t("settings.notifications.sound.preview")}
                testId="settings-voice-leave-sound"
                volume={voiceLeaveVolume}
                volumeLabel={t("settings.notifications.sound.volume")}
              />
              <p className="text-app-muted rounded-[20px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.22)] px-4 py-3 text-xs leading-5">
                {t("settings.notifications.sound.localDeviceNote")}
              </p>
            </div>
          </SettingCard>
        ) : null}
      </div>
    );
  };

  const renderAboutSection = () => {
    const showOverview = panel === null || panel === "overview";
    const showBuild = panel === null || panel === "build";
    const showWhatsNew = panel === null || panel === "whatsNew";
    const showDesktop = panel === null || panel === "desktop";
    const showDeveloper = panel === null || panel === "developer";
    const featuredContributor = buildInfo.contributors.find(
      (contributor) => contributor === FEATURED_CONTRIBUTOR_NAME,
    );
    const contributorList = featuredContributor
      ? buildInfo.contributors.filter((contributor) => contributor !== featuredContributor)
      : buildInfo.contributors;

    return (
      <div className="space-y-6">
        <SectionHero
          badge={t("settings.about.badge")}
          description={t("settings.about.description")}
          title={t("settings.about.title")}
        />

        {showOverview ? (
          <SettingCard
            description={t("settings.about.overview.description")}
            icon={Info}
            title={t("common.overview")}
          >
            <div className="space-y-4">
              <p className="text-app-muted text-sm leading-7">
                {t("settings.about.overview.body")}
              </p>
              <p className="text-app-muted text-sm leading-7">
                {t("settings.about.overview.bodySecondary")}
              </p>
            </div>
          </SettingCard>
        ) : null}

        {showBuild ? (
          <SettingCard
            description={t("settings.about.buildInfo.description")}
            icon={LayoutPanelTop}
            title={t("settings.about.buildInfo.title")}
          >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <InfoPill label={t("settings.about.buildInfo.version")} value={buildInfo.version} />
                <InfoPill
                  label={t("settings.about.buildInfo.lastUpdate")}
                  value={buildInfo.lastUpdated}
                />
                <InfoPill label={t("settings.about.buildInfo.buildId")} value={buildInfo.buildId} />
                <InfoPill
                  label={t("settings.about.buildInfo.releaseChannel")}
                  value={buildInfo.releaseChannel}
                />
                <InfoPill
                  label={t("settings.about.buildInfo.buildTime")}
                  value={buildInfo.buildTime || t("settings.about.buildInfo.developmentBuild")}
                />
              </div>

              <div className="app-panel-soft inline-flex max-w-full flex-wrap items-center gap-2 rounded-[22px] border px-4 py-3 text-[11px] font-semibold text-app-muted shadow-[0_14px_32px_hsl(var(--shadow-color)/0.06)]">
                <span className="text-app-foreground">{t("shell.footer.builtWith")}</span>
                <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-[hsl(var(--primary))]">
                  AI
                </span>
                <span className="text-app-soft">/</span>
                <span>{t("shell.footer.codex")}</span>
                <span className="text-app-soft">/</span>
                <span>{buildInfo.lastUpdated}</span>
              </div>
            </div>
          </SettingCard>
        ) : null}

        {showWhatsNew ? (
          <SettingCard
            description={t("settings.about.whatsNew.description")}
            icon={Sparkles}
            title={t("settings.about.whatsNew.title")}
          >
            <div className="grid gap-3">
              {buildInfo.notes.map((note) => (
                <article
                  className="app-panel-soft rounded-[24px] border p-4 shadow-[0_14px_34px_hsl(var(--shadow-color)/0.05)]"
                  key={note.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">
                        {t(note.categoryKey)}
                      </p>
                      <h4 className="mt-2 text-base font-semibold text-app-foreground">
                        {t(note.titleKey)}
                      </h4>
                    </div>
                    <span className="rounded-full border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.1)] px-3 py-1 text-[11px] font-bold text-[hsl(var(--primary))]">
                      v{buildInfo.version}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-app-muted">{t(note.descriptionKey)}</p>
                </article>
              ))}
            </div>
          </SettingCard>
        ) : null}

        {showDesktop ? (
          <SettingCard
            description={t("settings.about.desktop.description")}
            icon={MonitorUp}
            title={t("settings.about.desktop.title")}
          >
            <DesktopDiagnosticsPanel />
          </SettingCard>
        ) : null}

        {showDeveloper ? (
          <SettingCard
            description={t("settings.about.developer.description")}
            icon={UserRound}
            title={t("settings.about.developer.title")}
          >
            <div className="space-y-4">
              <InfoPill
                label={t("settings.about.developer.name")}
                value={buildInfo.developerName}
              />

              <div className="app-panel-soft rounded-[24px] border p-4">
                <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.18em]">
                  {t("settings.about.developer.contributors")}
                </p>
                <p className="text-app-muted mt-2 text-sm leading-6">
                  {t("settings.about.developer.contributorsDescription")}
                </p>

                {featuredContributor ? (
                  <div className="relative mt-4 overflow-hidden rounded-[24px] border border-[hsl(var(--primary)/0.28)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),hsl(var(--surface)/0.9)_54%,hsl(var(--accent)/0.14))] p-4 shadow-[0_24px_72px_hsl(var(--primary)/0.14)]">
                    <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full bg-[hsl(var(--primary)/0.18)] blur-3xl" />
                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--surface)/0.78)] text-sm font-bold text-[hsl(var(--primary))] shadow-inner">
                          OG
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
                            {t("settings.about.developer.featuredContributor")}
                          </p>
                          <p className="mt-1 truncate text-base font-semibold text-app-foreground">
                            {featuredContributor}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--surface)/0.78)] px-3 py-1 text-xs font-semibold text-[hsl(var(--primary))]">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("settings.about.developer.featuredContributorBadge")}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {contributorList.map((contributor) => (
                    <div className="app-panel rounded-[20px] border px-4 py-3" key={contributor}>
                      <p className="text-sm font-medium text-app-foreground">{contributor}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SettingCard>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="min-w-0 max-w-full space-y-6 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+6rem)] lg:pb-0"
      data-testid="settings-panel"
    >
      {section === "account" ? renderAccountSection() : null}
      {section === "voice" ? renderVoiceSection() : null}
      {section === "appearance" ? renderAppearanceSection() : null}
      {section === "notifications" ? renderNotificationsSection() : null}
      {section === "about" ? renderAboutSection() : null}
    </div>
  );
}
