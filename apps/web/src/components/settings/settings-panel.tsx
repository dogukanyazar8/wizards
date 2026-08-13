"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BellRing,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Gamepad2,
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
  Search,
  ShieldCheck,
  Sparkles,
  Type,
  UserRound,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { UserStatus } from "@wizards/db/browser";
import {
  ACCOUNT_FORMAT_PREVIEW_INSTANT,
  formatAccountDate,
  formatAccountTime,
  getAccountTimeZoneOptions,
} from "@wizards/types";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { useI18n } from "@/components/providers/locale-provider";
import { ProfileAvatarField } from "@/components/settings/profile-avatar-field";
import { ThemePicker } from "@/components/theme/theme-picker";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  NOTIFICATION_LIMIT_OPTIONS,
  NOTIFICATION_POPUP_TIMEOUT_STEP,
} from "@/lib/appearance";
import { APP_ICON_OPTIONS, type AppIconId } from "@/lib/app-icons";
import { getDesktopAppInfo, type DesktopAppInfo } from "@/lib/desktop/controls";
import type { DesktopRichPresenceAudience } from "@/lib/desktop/privacy";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import {
  MESSAGE_FONT_OPTIONS,
  normalizeMessageFontId,
  type MessageFontId,
} from "@/lib/message-fonts";
import {
  type AccountSettingsState,
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  startTwoFactorSetupAction,
  type StartTwoFactorSetupActionResult,
  type UpdateAccountSettingsResult,
  updateAccountSettingsAction,
} from "@/lib/account/actions";
import {
  getProfileCompletionSummary,
  type ProfileCompletionSummary,
} from "@/lib/account/profile-completion";
import { AccountBadgesCard } from "@/components/settings/account-badges-card";
import { ActiveSessionsCard } from "@/components/settings/active-sessions-card";
import { AccountDataControls } from "@/components/settings/account-data-controls";
import { getAccountSettingsSurface } from "@/components/settings/account-settings-surface";
import { BADGE_QUERY_STALE_TIME_MS, badgeQueryKeys, fetchOwnBadges } from "@/lib/badges/client";
import { fetchLayoutSettings, patchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import {
  buildSettingsHref,
  resolveSettingsSelection,
  type SettingsPanelKey,
  type SettingsSelection,
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
const ACCOUNT_SETTINGS_SURFACE = getAccountSettingsSurface();

const CameraPreferencesPanel = dynamic(
  () =>
    import("@/components/voice/camera-preferences-panel").then((mod) => mod.CameraPreferencesPanel),
  { ssr: false },
);
const DesktopDiagnosticsPanel = dynamic(
  () =>
    import("@/components/desktop/desktop-diagnostics-panel").then(
      (mod) => mod.DesktopDiagnosticsPanel,
    ),
  { ssr: false },
);
const ScreenSharePreferencesPanel = dynamic(
  () =>
    import("@/components/voice/screen-share-preferences-panel").then(
      (mod) => mod.ScreenSharePreferencesPanel,
    ),
  { ssr: false },
);
const SettingsVoiceProviderBoundary = dynamic(
  () =>
    import("@/components/settings/settings-voice-provider-boundary").then(
      (mod) => mod.SettingsVoiceProviderBoundary,
    ),
  { ssr: false },
);
const VoicePreferencesPanel = dynamic(
  () =>
    import("@/components/voice/voice-preferences-panel").then((mod) => mod.VoicePreferencesPanel),
  { ssr: false },
);

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
  className?: string;
  initialAccount: AccountSettingsState;
  onSelectionChange?: (selection: SettingsSelection) => void;
  selection?: SettingsSelection;
  uploadthingEnabled: boolean;
};

type AccountField = "displayName" | "email" | "status" | "username";
const subscribeToHydration = () => () => {};
const subscribeToDesktopRuntime = () => () => {};

type DmPolicyValue = UserLayoutSettings["dmPolicy"];
type FriendRequestPolicyValue = UserLayoutSettings["friendRequestPolicy"];
type VisibilityPolicyValue = UserLayoutSettings["profileVisibility"];

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

const VISIBILITY_POLICY_OPTIONS = [
  "EVERYONE",
  "FRIENDS",
  "NOBODY",
] as const satisfies readonly VisibilityPolicyValue[];
const DATE_FORMAT_OPTIONS = [
  "LOCALE",
  "DMY",
  "MDY",
  "YMD",
] as const satisfies readonly UserLayoutSettings["dateFormat"][];
const TIME_FORMAT_OPTIONS = [
  "LOCALE",
  "H12",
  "H24",
] as const satisfies readonly UserLayoutSettings["timeFormat"][];
const INTERFACE_DENSITY_OPTIONS = [
  "COMFORTABLE",
  "COMPACT",
] as const satisfies readonly UserLayoutSettings["interfaceDensity"][];

const DESKTOP_RICH_PRESENCE_AUDIENCE_OPTIONS = [
  "nobody",
  "friends",
] as const satisfies readonly DesktopRichPresenceAudience[];

function getDmPolicyLabelKey(policy: DmPolicyValue) {
  return `settings.account.privacy.dmPolicy.${policy}`;
}

function getFriendRequestPolicyLabelKey(policy: FriendRequestPolicyValue) {
  return `settings.account.privacy.friendRequestPolicy.${policy}`;
}

function getVisibilityPolicyLabelKey(policy: VisibilityPolicyValue) {
  return `settings.account.visibility.${policy.toLowerCase()}`;
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
    <section className="app-panel min-w-0 max-w-full overflow-hidden rounded-[20px] border p-3 sm:p-4">
      <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.2em]">{badge}</p>
      <h2 className="text-app-foreground mt-1.5 text-lg font-semibold tracking-tight sm:text-xl">
        {title}
      </h2>
      <p className="text-app-muted mt-1.5 max-w-3xl text-xs leading-5">{description}</p>
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
    <section className="app-panel min-w-0 max-w-full overflow-hidden rounded-[20px] border p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="app-panel-soft mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[hsl(var(--primary))]">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-app-foreground text-[15px] font-semibold">{title}</h3>
            <p className="text-app-muted mt-0.5 text-xs leading-5">{description}</p>
          </div>
        </div>
        {badge ? (
          <Badge className="shrink-0" tone="muted">
            {badge}
          </Badge>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-panel-soft rounded-[16px] border p-2.5">
      <p className="text-app-soft text-[10px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="text-app-foreground mt-1 break-words text-xs font-medium">{value}</p>
    </div>
  );
}

function formatNativeVersion(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.toLowerCase().startsWith("v") ? trimmedValue : `v${trimmedValue}`;
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
    <div className="app-panel-soft rounded-[18px] border p-2.5 sm:p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-app-foreground">{label}</p>
          <p className="text-app-muted mt-0.5 text-xs leading-4">{description}</p>
        </div>
        <button
          aria-checked={checked}
          className={cn(
            "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
              "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_6px_16px_hsl(var(--shadow-color)/0.16)] transition",
              checked && "translate-x-5 bg-[hsl(var(--primary))]",
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
    <div className="app-panel-soft rounded-[18px] border p-2.5 sm:p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-app-foreground">{label}</p>
          <p className="text-app-muted mt-0.5 text-xs leading-4">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="min-h-9 rounded-xl border border-[hsl(var(--border)/0.78)] px-2.5 py-1.5 text-xs font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.46)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-50"
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
              "relative inline-flex h-7 w-12 items-center rounded-full border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                "absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_6px_16px_hsl(var(--shadow-color)/0.16)] transition",
                checked && "translate-x-5 bg-[hsl(var(--primary))]",
              )}
            />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_minmax(160px,220px)]">
        <div>
          <label
            className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft"
            htmlFor={testId ? `${testId}-profile` : undefined}
          >
            {profileLabel}
          </label>
          <select
            className="app-panel mt-1.5 w-full rounded-xl border px-3 py-2 text-xs text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft">
              {volumeLabel}
            </label>
            <span className="rounded-full border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-card)/0.72)] px-2 py-0.5 text-[11px] font-semibold text-app-foreground">
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

function getLocaleDisplayName(locale: "en" | "tr") {
  return locale === "tr" ? "T\u00fcrk\u00e7e" : "English";
}

function formatSettingsBuildTime(value: string | null | undefined, locale: "en" | "tr") {
  const parsed = value ? new Date(value) : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
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
    <section className="min-w-0 max-w-4xl px-0.5 py-0.5">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[hsl(var(--primary-text-emphasis,var(--primary)))]">
        {eyebrow}
      </p>
      <h2 className="mt-1.5 text-xl font-extrabold tracking-tight text-app-foreground sm:text-2xl">
        {title}
      </h2>
      <p className="mt-1.5 max-w-3xl text-xs leading-5 text-app-muted">{description}</p>
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
    <div className="flex min-h-[64px] flex-col justify-center rounded-[15px] border border-[hsl(var(--border)/0.62)] bg-[linear-gradient(180deg,hsl(var(--surface)/0.86),hsl(var(--surface-soft)/0.34))] p-2.5 shadow-[inset_0_1px_0_hsl(var(--surface-highlight)/0.36)]">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-app-soft">{label}</p>
      <div className="mt-1 flex min-h-7 min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1 break-words text-xs font-bold leading-4 text-app-foreground">
          {value}
        </div>
        {action ?? <span className="h-7 w-7 shrink-0" aria-hidden="true" />}
      </div>
    </div>
  );
}

function ProfileSummaryCard({
  account,
  completion,
  editForm,
  isEditing,
  onEdit,
  statusLabel,
  t,
  visibleName,
}: {
  account: AccountSettingsState;
  completion: ProfileCompletionSummary;
  editForm?: ReactNode;
  isEditing: boolean;
  onEdit: () => void;
  statusLabel: string;
  t: (key: string, values?: Record<string, number | string>) => string;
  visibleName: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[22px] border border-[hsl(var(--border)/0.66)] bg-[linear-gradient(135deg,hsl(var(--surface)/0.98),hsl(var(--surface-soft)/0.52))] p-3 shadow-[0_14px_38px_hsl(var(--shadow-color)/0.06)] sm:p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <UserRound className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-extrabold text-app-foreground">
            {t("settings.account.summaryTitle")}
          </h3>
          <p className="mt-0.5 text-xs leading-4 text-app-muted">
            {t("settings.account.summaryDescription")}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <Avatar
              alt={visibleName}
              className="h-16 w-16 rounded-full border-[hsl(var(--primary)/0.2)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.24),hsl(var(--primary)/0.1))] text-base shadow-[0_14px_34px_hsl(var(--primary)/0.1)] ring-4 ring-[hsl(var(--primary)/0.08)] sm:h-20 sm:w-20"
              fallback={buildAvatarFallback(account)}
              src={account.avatarUrl}
            />
            <span className="absolute bottom-1 right-0.5 h-4 w-4 rounded-full border-[3px] border-[hsl(var(--surface))] bg-emerald-500 shadow-[0_8px_18px_hsl(var(--shadow-color)/0.16)]" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="max-w-full truncate text-lg font-extrabold tracking-tight text-app-foreground">
                {visibleName}
              </h4>
              <Badge className="border-emerald-500/25 bg-emerald-500/10 text-[hsl(var(--success-text-emphasis,#059669))]">
                {statusLabel}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs font-semibold text-app-muted">
              @{account.username}
            </p>
            <p className="mt-1 break-words text-xs font-medium text-app-muted">{account.email}</p>
          </div>
        </div>

        {!isEditing ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[150px]">
            <Button className="w-full justify-center" onClick={onEdit} type="button">
              {t("settings.account.profile.edit")}
            </Button>
          </div>
        ) : null}
      </div>

      {isEditing && editForm ? (
        editForm
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <AccountInfoTile label={t("settings.account.fields.displayName")} value={visibleName} />
          <AccountInfoTile
            action={
              <button
                aria-label={t("settings.account.copy.username")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-app-soft transition hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                onClick={() => copyAccountValue(account.username)}
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            }
            label={t("common.username")}
            value={`@${account.username}`}
          />
          <AccountInfoTile
            action={
              <button
                aria-label={t("settings.account.copy.email")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-app-soft transition hover:bg-[hsl(var(--primary)/0.1)] hover:text-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                onClick={() => copyAccountValue(account.email)}
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            }
            label={t("common.email")}
            value={account.email}
          />
          <AccountInfoTile
            label={t("settings.account.fields.emailStatus")}
            value={
              account.emailVerified ? (
                <span className="inline-flex items-center gap-1.5 text-[hsl(var(--success-text-emphasis,#059669))]">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t("settings.account.security.emailVerified")}
                </span>
              ) : (
                <Badge tone="muted">{t("settings.account.security.emailUnverified")}</Badge>
              )
            }
          />
        </div>
      )}

      <div className="mt-3 rounded-[16px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)] p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-extrabold text-app-foreground">
            {t("settings.account.completion.title")}
          </p>
          <span className="text-xs font-black text-[hsl(var(--primary-text-emphasis,var(--primary)))]">
            %{completion.percent}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--surface-soft)/0.82)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--primary)/0.58))] shadow-[0_10px_24px_hsl(var(--primary)/0.2)] transition-all"
            style={{ width: `${completion.percent}%` }}
          />
        </div>
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-medium leading-4 text-app-muted">
            {t("settings.account.completion.description")}
          </p>
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] px-3 text-xs font-black text-[hsl(var(--primary-text-emphasis,var(--primary)))] transition hover:bg-[hsl(var(--primary)/0.16)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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
    <section className="rounded-[20px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] p-3 shadow-[0_12px_32px_hsl(var(--shadow-color)/0.05)] sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <Camera className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-app-foreground">
            {t("settings.account.avatar.title")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            {t("settings.account.avatar.description")}
          </p>
        </div>
      </div>
      <div className="mt-3">
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
        "flex items-center gap-2 rounded-[15px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)] p-2 transition",
        disabled
          ? "opacity-72"
          : "hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--primary)/0.06)]",
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-app-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-4 text-app-muted">{description}</p>
        {note ? <p className="mt-1 text-[11px] font-semibold text-app-soft">{note}</p> : null}
      </div>
      {status}
    </div>
  );
}

function SecurityCenterCard({
  account,
  onTwoFactorUpdated,
  t,
}: {
  account: AccountSettingsState;
  onTwoFactorUpdated: (enabled: boolean) => void;
  t: (key: string, values?: Record<string, number | string>) => string;
}) {
  const [isTwoFactorPending, startTwoFactorTransition] = useTransition();
  const [setupMaterial, setSetupMaterial] = useState<Extract<
    StartTwoFactorSetupActionResult,
    { success: true }
  > | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    value: string;
  } | null>(null);

  const showTwoFactorFailure = (error: string, retryAfterSeconds?: number) => {
    setFeedback({
      tone: "error",
      value:
        retryAfterSeconds === undefined
          ? t(error)
          : `${t(error)} ${t("settings.account.twoFactor.retryAfter", {
              seconds: retryAfterSeconds,
            })}`,
    });
  };

  const beginTwoFactorSetup = () => {
    startTwoFactorTransition(() => {
      void (async () => {
        setFeedback(null);
        setRecoveryCodes([]);
        const result = await startTwoFactorSetupAction();

        if (!result.success) {
          showTwoFactorFailure(result.error);
          return;
        }

        setSetupMaterial(result);
        setSetupCode("");
        setFeedback({
          tone: "success",
          value: t("settings.account.twoFactor.setupReady"),
        });
      })();
    });
  };

  const confirmTwoFactor = () => {
    startTwoFactorTransition(() => {
      void (async () => {
        setFeedback(null);
        const result = await confirmTwoFactorSetupAction(setupCode);

        if (!result.success) {
          showTwoFactorFailure(
            result.error,
            "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined,
          );
          return;
        }

        setRecoveryCodes(result.recoveryCodes);
        setSetupMaterial(null);
        setSetupCode("");
        onTwoFactorUpdated(true);
        setFeedback({
          tone: "success",
          value: t("settings.account.twoFactor.enabled"),
        });
      })();
    });
  };

  const disableCurrentTwoFactor = () => {
    startTwoFactorTransition(() => {
      void (async () => {
        setFeedback(null);
        const result = await disableTwoFactorAction({
          code: disableCode,
          password: disablePassword,
        });

        if (!result.success) {
          showTwoFactorFailure(result.error, result.retryAfterSeconds);
          return;
        }

        setDisableCode("");
        setDisablePassword("");
        setRecoveryCodes([]);
        onTwoFactorUpdated(false);
        setFeedback({
          tone: "success",
          value: t("settings.account.twoFactor.disabled"),
        });
      })();
    });
  };

  const copyRecoveryCodes = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard || recoveryCodes.length === 0) {
      return;
    }

    void navigator.clipboard.writeText(recoveryCodes.join("\n"));
  };

  return (
    <section className="rounded-[20px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] p-3 shadow-[0_12px_32px_hsl(var(--shadow-color)/0.05)] sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-500">
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-app-foreground">
            {t("settings.account.security.title")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            {t("settings.account.security.description")}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
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
          icon={LockKeyhole}
          status={
            account.twoFactorEnabled ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <Badge tone="muted">{t("settings.account.twoFactor.off")}</Badge>
            )
          }
          title={t("settings.account.quickSuggestions.twoFactor.title")}
        />
        <SuggestionRow
          description={t("settings.account.quickSuggestions.recoveryCodes.description")}
          icon={KeyRound}
          status={
            account.twoFactorEnabled ? (
              <Badge>{t("settings.account.twoFactor.generated")}</Badge>
            ) : (
              <Badge tone="muted">{t("settings.account.twoFactor.off")}</Badge>
            )
          }
          title={t("settings.account.quickSuggestions.recoveryCodes.title")}
        />
      </div>

      <div className="mt-3 rounded-[16px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--background)/0.46)] p-3">
        {feedback ? (
          <div
            className={cn(
              "mb-3 rounded-xl border px-3 py-2 text-xs font-semibold",
              feedback.tone === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-[hsl(var(--success-text-emphasis,#059669))]"
                : "border-rose-500/25 bg-rose-500/10 text-rose-600",
            )}
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.value}
          </div>
        ) : null}

        {recoveryCodes.length > 0 ? (
          <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-app-foreground">
                  {t("settings.account.twoFactor.recoveryTitle")}
                </p>
                <p className="mt-1 text-xs leading-5 text-app-muted">
                  {t("settings.account.twoFactor.recoveryDescription")}
                </p>
              </div>
              <button
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                onClick={copyRecoveryCodes}
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
                {t("common.copy")}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {recoveryCodes.map((code) => (
                <code
                  className="rounded-lg bg-[hsl(var(--surface)/0.86)] px-2 py-1.5 text-xs font-black text-app-foreground"
                  key={code}
                >
                  {code}
                </code>
              ))}
            </div>
          </div>
        ) : null}

        {!account.twoFactorEnabled ? (
          setupMaterial ? (
            <div className="grid gap-3 lg:grid-cols-[132px_1fr]">
              <Image
                alt={t("settings.account.twoFactor.qrAlt")}
                className="rounded-xl border border-[hsl(var(--border)/0.7)] bg-white p-2"
                data-testid="two-factor-setup-qr-code"
                height={132}
                src={setupMaterial.qrCodeDataUrl}
                unoptimized
                width={132}
              />
              <div className="min-w-0 space-y-3">
                <div>
                  <p className="text-xs font-black text-app-foreground">
                    {t("settings.account.twoFactor.manualKey")}
                  </p>
                  <code className="mt-1 block break-all rounded-lg bg-[hsl(var(--surface)/0.86)] px-2 py-1.5 text-xs font-black text-app-foreground">
                    {setupMaterial.manualEntryKey}
                  </code>
                </div>
                <label className="block text-xs font-bold text-app-muted" htmlFor="two-factor-code">
                  {t("settings.account.twoFactor.confirmLabel")}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="min-h-10 flex-1 rounded-xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.84)] px-3 text-sm font-semibold text-app-foreground outline-hidden transition focus:border-[hsl(var(--primary)/0.45)] focus:ring-2 focus:ring-[hsl(var(--primary)/0.16)]"
                    id="two-factor-code"
                    inputMode="numeric"
                    onChange={(event) => setSetupCode(event.target.value)}
                    placeholder={t("settings.account.twoFactor.codePlaceholder")}
                    type="text"
                    value={setupCode}
                  />
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-3 text-xs font-black text-[hsl(var(--primary-foreground))] transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isTwoFactorPending}
                    onClick={confirmTwoFactor}
                    type="button"
                  >
                    {t("settings.account.twoFactor.confirmCta")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3 text-xs font-black text-[hsl(var(--primary-foreground))] transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isTwoFactorPending}
              onClick={beginTwoFactorSetup}
              type="button"
            >
              <ShieldCheck className="h-4 w-4" />
              {t("settings.account.twoFactor.setupCta")}
            </button>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-app-muted">
              {t("settings.account.twoFactor.disableDescription")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="min-h-10 rounded-xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.84)] px-3 text-sm font-semibold text-app-foreground outline-hidden transition focus:border-[hsl(var(--primary)/0.45)] focus:ring-2 focus:ring-[hsl(var(--primary)/0.16)]"
                onChange={(event) => setDisablePassword(event.target.value)}
                placeholder={t("settings.account.twoFactor.passwordPlaceholder")}
                type="password"
                value={disablePassword}
              />
              <input
                className="min-h-10 rounded-xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface)/0.84)] px-3 text-sm font-semibold text-app-foreground outline-hidden transition focus:border-[hsl(var(--primary)/0.45)] focus:ring-2 focus:ring-[hsl(var(--primary)/0.16)]"
                onChange={(event) => setDisableCode(event.target.value)}
                placeholder={t("settings.account.twoFactor.codeOrRecoveryPlaceholder")}
                type="text"
                value={disableCode}
              />
            </div>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-500/30 px-3 text-xs font-black text-rose-600 transition hover:bg-rose-500/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isTwoFactorPending}
              onClick={disableCurrentTwoFactor}
              type="button"
            >
              <LockKeyhole className="h-4 w-4" />
              {t("settings.account.twoFactor.disableCta")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function AccountPreferenceRow({
  description,
  icon: Icon,
  title,
  value,
  onClick,
}: {
  description: string;
  icon: LucideIcon;
  onClick?: () => void;
  title: string;
  value: string;
}) {
  const content = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-app-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-app-muted">{description}</span>
      </span>
      <span className="flex min-w-0 shrink-0 items-center gap-2 text-right text-xs font-black text-app-muted">
        <span className="max-w-[8rem] truncate sm:max-w-[12rem]">{value}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-app-soft" />
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        className="flex w-full items-center gap-2 rounded-[15px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)] p-2 text-left transition hover:border-[hsl(var(--primary)/0.28)] hover:bg-[hsl(var(--primary)/0.06)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-[15px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)] p-2">
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
    <div className="flex flex-col gap-2 rounded-[15px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)] p-2 sm:flex-row sm:items-center">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-app-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-app-muted">{description}</span>
      </span>
      <select
        aria-label={title}
        className="min-h-9 w-full rounded-lg border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] px-2.5 text-xs font-bold text-app-foreground transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-[12rem]"
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

function AccountTimeZoneCombobox({
  disabled,
  locale,
  onChange,
  t,
  value,
}: {
  disabled: boolean;
  locale: "en" | "tr";
  onChange: (value: string) => void;
  t: (key: string, values?: Record<string, number | string>) => string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => getAccountTimeZoneOptions({ selectedTimeZone: value }), [value]);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    return normalized
      ? options.filter((option) => option.toLocaleLowerCase(locale).includes(normalized))
      : options;
  }, [locale, options, query]);
  const displayValue = value === "AUTO" ? t("settings.account.preferences.timeZone.auto") : value;

  return (
    <div
      className="relative rounded-[15px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)] p-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div className="flex items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
          <Clock3 className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-app-foreground">
            {t("settings.account.preferences.timeZone.title")}
          </span>
          <span className="mt-0.5 block text-xs leading-4 text-app-muted">
            {t("settings.account.preferences.timeZone.description")}
          </span>
        </span>
      </div>
      <div className="relative mt-2">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-soft"
        />
        <input
          aria-autocomplete="list"
          aria-controls="account-time-zone-options"
          aria-expanded={open}
          aria-label={t("settings.account.preferences.timeZone.title")}
          className="min-h-11 w-full rounded-xl border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] pl-9 pr-3 text-xs font-bold text-app-foreground outline-hidden transition placeholder:font-medium placeholder:text-app-soft focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          placeholder={displayValue}
          role="combobox"
          value={query}
        />
        {open ? (
          <div
            className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--surface))] p-1 shadow-[0_18px_45px_hsl(var(--shadow-color)/0.18)]"
            id="account-time-zone-options"
            role="listbox"
          >
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const label =
                  option === "AUTO" ? t("settings.account.preferences.timeZone.auto") : option;
                return (
                  <button
                    aria-selected={option === value}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-xs font-semibold transition hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      option === value &&
                        "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
                    )}
                    key={option}
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                      setQuery("");
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0 break-all">{label}</span>
                    {option === "AUTO" ? (
                      <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-app-soft">
                        {Intl.DateTimeFormat().resolvedOptions().timeZone}
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-center text-xs font-semibold text-app-muted">
                {t("settings.account.preferences.timeZone.noResults")}
              </p>
            )}
          </div>
        ) : null}
      </div>
      <p className="mt-1.5 break-all px-1 text-[11px] font-semibold text-app-soft">
        {displayValue}
      </p>
    </div>
  );
}

function PrivacyVisibilityCard({
  dmPolicy,
  disabled,
  error,
  friendRequestPolicy,
  onDmPolicyChange,
  onFriendRequestPolicyChange,
  onPresenceVisibilityChange,
  onProfileVisibilityChange,
  presenceVisibility,
  profileVisibility,
  t,
}: {
  disabled: boolean;
  dmPolicy: DmPolicyValue;
  error: string | null;
  friendRequestPolicy: FriendRequestPolicyValue;
  onDmPolicyChange: (policy: DmPolicyValue) => void;
  onFriendRequestPolicyChange: (policy: FriendRequestPolicyValue) => void;
  onPresenceVisibilityChange: (policy: VisibilityPolicyValue) => void;
  onProfileVisibilityChange: (policy: VisibilityPolicyValue) => void;
  presenceVisibility: VisibilityPolicyValue;
  profileVisibility: VisibilityPolicyValue;
  t: (key: string, values?: Record<string, number | string>) => string;
}) {
  return (
    <section className="rounded-[20px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] p-3 shadow-[0_12px_32px_hsl(var(--shadow-color)/0.05)] sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <ShieldCheck className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-extrabold text-app-foreground">
            {t("settings.account.privacy.title")}
          </h3>
          <p className="mt-0.5 text-xs leading-4 text-app-muted">
            {t("settings.account.privacy.description")}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {ACCOUNT_SETTINGS_SURFACE.privacy.includes("profileVisibility") ? (
          <AccountPreferenceSelectRow
            description={t(
              `settings.account.visibility.profile.${profileVisibility.toLowerCase()}`,
            )}
            disabled={disabled}
            icon={Eye}
            labelForValue={(value) => t(getVisibilityPolicyLabelKey(value))}
            onChange={onProfileVisibilityChange}
            options={VISIBILITY_POLICY_OPTIONS}
            title={t("settings.account.privacy.profile.title")}
            value={profileVisibility}
          />
        ) : null}
        {ACCOUNT_SETTINGS_SURFACE.privacy.includes("presenceVisibility") ? (
          <AccountPreferenceSelectRow
            description={t(
              `settings.account.visibility.presence.${presenceVisibility.toLowerCase()}`,
            )}
            disabled={disabled}
            icon={UserRound}
            labelForValue={(value) => t(getVisibilityPolicyLabelKey(value))}
            onChange={onPresenceVisibilityChange}
            options={VISIBILITY_POLICY_OPTIONS}
            title={t("settings.account.privacy.online.title")}
            value={presenceVisibility}
          />
        ) : null}
        {ACCOUNT_SETTINGS_SURFACE.privacy.includes("dmPolicy") ? (
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
        ) : null}
        {ACCOUNT_SETTINGS_SURFACE.privacy.includes("friendRequestPolicy") ? (
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
        ) : null}
        {error ? (
          <p
            aria-live="polite"
            className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600"
          >
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function AccountPreferencesCard({
  disabled,
  locale,
  onChange,
  onOpenLanguageSettings,
  settings,
  t,
}: {
  disabled: boolean;
  locale: "en" | "tr";
  onChange: (patch: Partial<UserLayoutSettings>) => void;
  onOpenLanguageSettings: () => void;
  settings: Pick<UserLayoutSettings, "dateFormat" | "interfaceDensity" | "timeFormat" | "timeZone">;
  t: (key: string, values?: Record<string, number | string>) => string;
}) {
  const intlLocale = locale === "tr" ? "tr-TR" : "en-US";
  const formatOptions = {
    locale: intlLocale,
    timeZone: settings.timeZone,
  } as const;

  return (
    <section className="rounded-[20px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] p-3 shadow-[0_12px_32px_hsl(var(--shadow-color)/0.05)] sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          <Globe2 className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-extrabold text-app-foreground">
            {t("settings.account.preferences.title")}
          </h3>
          <p className="mt-0.5 text-xs leading-4 text-app-muted">
            {t("settings.account.preferences.description")}
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {ACCOUNT_SETTINGS_SURFACE.preferences.includes("language") ? (
          <AccountPreferenceRow
            description={t("settings.account.preferences.language.description")}
            icon={Languages}
            onClick={onOpenLanguageSettings}
            title={t("settings.account.preferences.language.title")}
            value={getLocaleDisplayName(locale)}
          />
        ) : null}
        {ACCOUNT_SETTINGS_SURFACE.preferences.includes("timeZone") ? (
          <AccountTimeZoneCombobox
            disabled={disabled}
            locale={locale}
            onChange={(timeZone) => onChange({ timeZone })}
            t={t}
            value={settings.timeZone}
          />
        ) : null}
        {ACCOUNT_SETTINGS_SURFACE.preferences.includes("dateFormat") ? (
          <AccountPreferenceSelectRow
            description={t("settings.account.preferences.dateFormat.description")}
            disabled={disabled}
            icon={CalendarDays}
            labelForValue={(value) =>
              `${t(`settings.account.preferences.dateFormat.${value}`)} · ${formatAccountDate(
                ACCOUNT_FORMAT_PREVIEW_INSTANT,
                { ...formatOptions, dateFormat: value },
              )}`
            }
            onChange={(dateFormat) => onChange({ dateFormat })}
            options={DATE_FORMAT_OPTIONS}
            title={t("settings.account.preferences.dateFormat.title")}
            value={settings.dateFormat}
          />
        ) : null}
        {ACCOUNT_SETTINGS_SURFACE.preferences.includes("timeFormat") ? (
          <AccountPreferenceSelectRow
            description={t("settings.account.preferences.timeFormat.description")}
            disabled={disabled}
            icon={Clock3}
            labelForValue={(value) =>
              `${t(`settings.account.preferences.timeFormat.${value}`)} · ${formatAccountTime(
                ACCOUNT_FORMAT_PREVIEW_INSTANT,
                { ...formatOptions, timeFormat: value },
              )}`
            }
            onChange={(timeFormat) => onChange({ timeFormat })}
            options={TIME_FORMAT_OPTIONS}
            title={t("settings.account.preferences.timeFormat.title")}
            value={settings.timeFormat}
          />
        ) : null}
        {ACCOUNT_SETTINGS_SURFACE.preferences.includes("interfaceDensity") ? (
          <div className="rounded-[15px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)] p-2">
            <div className="flex items-start gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
                <LayoutPanelTop className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-app-foreground">
                  {t("settings.account.preferences.accessibility.title")}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-app-muted">
                  {t("settings.account.preferences.accessibility.description")}
                </span>
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {INTERFACE_DENSITY_OPTIONS.map((density) => (
                <button
                  aria-pressed={density === settings.interfaceDensity}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                    density === settings.interfaceDensity
                      ? "border-[hsl(var(--primary)/0.48)] bg-[hsl(var(--primary)/0.12)]"
                      : "border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface)/0.9)] hover:border-[hsl(var(--primary)/0.3)]",
                  )}
                  disabled={disabled}
                  key={density}
                  onClick={() => onChange({ interfaceDensity: density })}
                  type="button"
                >
                  <span className="block text-xs font-black text-app-foreground">
                    {t(`settings.account.preferences.accessibility.${density}`)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "mt-2 grid rounded-lg border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-soft)/0.6)] px-2",
                      density === "COMPACT" ? "gap-1 py-1.5" : "gap-2 py-2.5",
                    )}
                  >
                    <span className="h-1.5 w-3/4 rounded-full bg-[hsl(var(--primary)/0.32)]" />
                    <span className="h-1.5 w-1/2 rounded-full bg-[hsl(var(--foreground)/0.14)]" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SettingsPanel(props: SettingsPanelProps) {
  const accountKey = `${props.initialAccount.username}:${props.initialAccount.displayName}:${props.initialAccount.status}`;
  return <SettingsPanelContent {...props} key={accountKey} />;
}

function SettingsPanelContent({
  buildInfo,
  className,
  initialAccount,
  onSelectionChange,
  selection,
  uploadthingEnabled,
}: SettingsPanelProps) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeSelection = resolveSettingsSelection(searchParams);
  const { panel, section } = selection ?? routeSelection;
  const clientReady = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [accountState, setAccountState] = useState(initialAccount);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [accountDraft, setAccountDraft] = useState(initialAccount);
  const [accountFeedback, setAccountFeedback] = useState<{
    tone: "error" | "success";
    value: string;
  } | null>(null);
  const [iconFeedbackVisible, setIconFeedbackVisible] = useState(false);
  const isDesktopRuntime = useSyncExternalStore(
    subscribeToDesktopRuntime,
    isWhisprDesktopRuntime,
    () => false,
  );
  const [desktopAppInfo, setDesktopAppInfo] = useState<DesktopAppInfo | null>(null);
  const [accountFieldErrors, setAccountFieldErrors] = useState<
    Partial<Record<AccountField, string>>
  >({});
  const [isSavingAccount, startSavingAccount] = useTransition();
  const {
    applyPersistedSettings,
    appIconId,
    desktopNotificationPreviews,
    desktopRichPresenceAudience,
    desktopRichPresenceEnabled,
    desktopStreamerModeEnabled,
    desktopStreamerModeProcessDetectionEnabled,
    messageFont,
    notificationAutoClose,
    notificationLimit,
    notificationPopupTimeoutSeconds,
    setAppIconId,
    setDesktopNotificationPreviews,
    setDesktopRichPresenceAudience,
    setDesktopRichPresenceEnabled,
    setDesktopStreamerModeEnabled,
    setDesktopStreamerModeProcessDetectionEnabled,
    setMessageFont,
    setNotificationAutoClose,
    setNotificationLimit,
    setNotificationPopupTimeoutSeconds,
  } = useAppStore(
    useShallow((state) => ({
      applyPersistedSettings: state.applyPersistedSettings,
      appIconId: state.appIconId,
      desktopNotificationPreviews: state.desktopNotificationPreviews,
      desktopRichPresenceAudience: state.desktopRichPresenceAudience,
      desktopRichPresenceEnabled: state.desktopRichPresenceEnabled,
      desktopStreamerModeEnabled: state.desktopStreamerModeEnabled,
      desktopStreamerModeProcessDetectionEnabled: state.desktopStreamerModeProcessDetectionEnabled,
      messageFont: state.messageFont,
      notificationAutoClose: state.notificationAutoClose,
      notificationLimit: state.notificationLimit,
      notificationPopupTimeoutSeconds: state.notificationPopupTimeoutSeconds,
      setAppIconId: state.setAppIconId,
      setDesktopNotificationPreviews: state.setDesktopNotificationPreviews,
      setDesktopRichPresenceAudience: state.setDesktopRichPresenceAudience,
      setDesktopRichPresenceEnabled: state.setDesktopRichPresenceEnabled,
      setDesktopStreamerModeEnabled: state.setDesktopStreamerModeEnabled,
      setDesktopStreamerModeProcessDetectionEnabled:
        state.setDesktopStreamerModeProcessDetectionEnabled,
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
    window.scrollTo({ left: 0, top: 0 });

    const settingsScrollRoot = document.querySelector<HTMLElement>("[data-settings-scroll-root]");
    settingsScrollRoot?.scrollTo({ left: 0, top: 0 });
  }, [panel, section]);

  useEffect(() => {
    let isActive = true;

    if (!isDesktopRuntime) {
      return () => {
        isActive = false;
      };
    }

    void getDesktopAppInfo()
      .then((info) => {
        if (isActive) {
          setDesktopAppInfo(info);
        }
      })
      .catch(() => {
        if (isActive) {
          setDesktopAppInfo(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isDesktopRuntime, t]);

  const settingsQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
    staleTime: 60_000,
  });

  /**
   * 07 §3. Fetched only while the badges panel is open: every other settings
   * panel would otherwise pay for a read it never draws. The key is the same
   * `badges.own()` the popover uses, so a BADGE notification refreshes both.
   */
  const ownBadgesQuery = useQuery({
    enabled: section === "account" && panel === "badges",
    queryFn: fetchOwnBadges,
    queryKey: badgeQueryKeys.own(),
    staleTime: BADGE_QUERY_STALE_TIME_MS,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      applyPersistedSettings(settingsQuery.data);
    }
  }, [applyPersistedSettings, settingsQuery.data]);

  const patchSettingsMutation = useMutation({
    mutationFn: (patch: Partial<UserLayoutSettings>) => patchLayoutSettings(patch),
    onMutate: async (patch) => {
      setSettingsSaveError(null);
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
      setSettingsSaveError(t("settings.account.errors.save"));
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.layout, context.previous);
        applyPersistedSettings(context.previous);
      }
    },
    onSuccess: (nextSettings) => {
      setSettingsSaveError(null);
      queryClient.setQueryData(settingsQueryKeys.layout, nextSettings);
      applyPersistedSettings(nextSettings);
    },
  });

  const serverSettings = settingsQuery.data;

  useEffect(() => {
    document.documentElement.dataset.interfaceDensity =
      serverSettings?.interfaceDensity.toLowerCase() ?? "comfortable";
  }, [serverSettings?.interfaceDensity]);

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

  const handleNotificationLimitChange = useCallback(
    (nextValue: number) => {
      void queryClient.cancelQueries({ queryKey: settingsQueryKeys.layout });
      setNotificationLimit(nextValue);
      queryClient.setQueryData<UserLayoutSettings | undefined>(
        settingsQueryKeys.layout,
        (current) => (current ? { ...current, notificationLimit: nextValue } : current),
      );
      updateServerSettings({ notificationLimit: nextValue });
    },
    [queryClient, setNotificationLimit, updateServerSettings],
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

  const navigateSettings = useCallback(
    (nextSection: SettingsSelection["section"], nextPanel?: SettingsPanelKey | null) => {
      if (onSelectionChange) {
        onSelectionChange({ panel: nextPanel ?? null, section: nextSection });
        return;
      }

      router.push(buildSettingsHref(nextSection, nextPanel));
    },
    [onSelectionChange, router],
  );

  const openPanel = (targetPanel: SettingsPanelKey) => {
    navigateSettings("appearance", targetPanel);
  };

  const handleAccountDraftChange = <TField extends keyof AccountSettingsState>(
    field: TField,
    value: AccountSettingsState[TField],
  ) => {
    setAccountDraft((current) => ({ ...current, [field]: value }));
    setAccountFieldErrors((current) => ({ ...current, [field]: undefined }));
    setAccountFeedback(null);
  };

  const beginAccountEditing = () => {
    setAccountDraft(accountState);
    setAccountFieldErrors({});
    setAccountFeedback(null);
    setIsEditingAccount(true);
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
    const dmPolicy = serverSettings?.dmPolicy ?? "FRIENDS";
    const friendRequestPolicy = serverSettings?.friendRequestPolicy ?? "EVERYONE";
    const profileVisibility = serverSettings?.profileVisibility ?? "EVERYONE";
    const presenceVisibility = serverSettings?.presenceVisibility ?? "EVERYONE";
    const accountEditForm = (
      <div className="mt-3 rounded-[16px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface)/0.72)] p-2.5 sm:p-3">
        <div className="grid gap-2.5 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-app-foreground">
              {t("settings.account.fields.displayName")}
            </span>
            <input
              className="w-full rounded-lg border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.88)] px-2.5 py-2 text-xs font-semibold text-app-foreground transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onChange={(event) => handleAccountDraftChange("displayName", event.target.value)}
              type="text"
              value={accountDraft.displayName ?? ""}
            />
            {accountFieldErrors.displayName ? (
              <p className="mt-1.5 text-xs font-semibold text-app-danger">
                {t(accountFieldErrors.displayName)}
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-app-foreground">
              {t("common.username")}
            </span>
            <input
              className="w-full rounded-lg border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.88)] px-2.5 py-2 text-xs font-semibold text-app-foreground transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onChange={(event) => handleAccountDraftChange("username", event.target.value)}
              type="text"
              value={accountDraft.username}
            />
            {accountFieldErrors.username ? (
              <p className="mt-1.5 text-xs font-semibold text-app-danger">
                {t(accountFieldErrors.username)}
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-app-foreground">
              {t("common.email")}
            </span>
            <input
              className="w-full rounded-lg border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.88)] px-2.5 py-2 text-xs font-semibold text-app-foreground transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onChange={(event) => handleAccountDraftChange("email", event.target.value)}
              type="email"
              value={accountDraft.email}
            />
            {accountFieldErrors.email ? (
              <p className="mt-1.5 text-xs font-semibold text-app-danger">
                {t(accountFieldErrors.email)}
              </p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-app-foreground">
              {t("settings.account.fields.status")}
            </span>
            <select
              className="w-full rounded-lg border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.88)] px-2.5 py-2 text-xs font-semibold text-app-foreground transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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

        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
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
      </div>
    );

    // 07 §3: a panel of this section rather than a route of its own, so the
    // badges view replaces the account body instead of opening a new surface.
    if (panel === "badges") {
      return (
        <div className="space-y-3">
          <AccountPageHeader
            description={t("settings.account.badges.description")}
            eyebrow={t("settings.account.badge")}
            title={t("settings.account.badges.title")}
          />
          <SettingCard
            description={t("settings.account.badges.description")}
            icon={Award}
            title={t("settings.account.badges.title")}
          >
            <AccountBadgesCard data={ownBadgesQuery.data ?? null} />
          </SettingCard>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <AccountPageHeader
          description={t("settings.account.pageDescription")}
          eyebrow={t("settings.account.badge")}
          title={t("settings.account.title")}
        />

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,312px)] 2xl:grid-cols-[minmax(0,1fr)_328px]">
          <div className="min-w-0 space-y-3">
            <ProfileSummaryCard
              account={accountState}
              completion={completion}
              editForm={accountEditForm}
              isEditing={isEditingAccount}
              onEdit={beginAccountEditing}
              statusLabel={statusLabel}
              t={t}
              visibleName={visibleName}
            />

            {accountFeedback ? (
              <div
                className={cn(
                  "rounded-[16px] border p-2.5 text-xs font-semibold shadow-[0_10px_24px_hsl(var(--shadow-color)/0.05)]",
                  accountFeedback.tone === "success"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-[hsl(var(--success-text-emphasis,#059669))]"
                    : "border-rose-500/25 bg-rose-500/10 text-rose-600",
                )}
              >
                {accountFeedback.value}
              </div>
            ) : null}

            <PrivacyVisibilityCard
              disabled={patchSettingsMutation.isPending}
              dmPolicy={dmPolicy}
              error={settingsSaveError}
              friendRequestPolicy={friendRequestPolicy}
              onDmPolicyChange={(nextPolicy) => updateServerSettings({ dmPolicy: nextPolicy })}
              onFriendRequestPolicyChange={(nextPolicy) =>
                updateServerSettings({ friendRequestPolicy: nextPolicy })
              }
              onPresenceVisibilityChange={(nextPolicy) =>
                updateServerSettings({ presenceVisibility: nextPolicy })
              }
              onProfileVisibilityChange={(nextPolicy) =>
                updateServerSettings({ profileVisibility: nextPolicy })
              }
              presenceVisibility={presenceVisibility}
              profileVisibility={profileVisibility}
              t={t}
            />
            <AccountPreferencesCard
              disabled={patchSettingsMutation.isPending}
              locale={locale}
              onChange={updateServerSettings}
              onOpenLanguageSettings={() => openPanel("language")}
              settings={{
                dateFormat: serverSettings?.dateFormat ?? "LOCALE",
                interfaceDensity: serverSettings?.interfaceDensity ?? "COMFORTABLE",
                timeFormat: serverSettings?.timeFormat ?? "LOCALE",
                timeZone: serverSettings?.timeZone ?? "AUTO",
              }}
              t={t}
            />
            <AccountDataControls t={t} />
          </div>

          <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
            <ProfilePhotoCard
              account={accountState}
              onAvatarUpdated={handleAvatarUpdated}
              t={t}
              uploadthingEnabled={uploadthingEnabled}
            />
            <SecurityCenterCard
              account={accountState}
              onTwoFactorUpdated={(enabled) =>
                setAccountState((current) => ({
                  ...current,
                  twoFactorEnabled: enabled,
                }))
              }
              t={t}
            />
            <ActiveSessionsCard t={t} />
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
      <SettingsVoiceProviderBoundary account={accountState}>
        <div className="space-y-3">
          <SectionHero
            badge={t("settings.groups.voiceVideo.badge")}
            description={t("settings.groups.voiceVideo.description")}
            title={t("settings.groups.voiceVideo.title")}
          />

          {showAudio ? <VoicePreferencesPanel mode="audio" /> : null}

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
      </SettingsVoiceProviderBoundary>
    );
  };

  const renderDesktopSection = () => {
    const showBehavior = panel === null || panel === "desktopBehavior";
    const showVoice = panel === null || panel === "desktopVoice";
    const showDiagnostics = panel === null || panel === "desktopDiagnostics";

    return (
      <div className="space-y-3">
        <SectionHero
          badge={t("settings.groups.desktop.badge")}
          description={t("settings.groups.desktop.description")}
          title={t("settings.groups.desktop.title")}
        />

        {showBehavior ? (
          <SettingCard
            description={t("settings.desktop.behavior.description")}
            icon={MonitorUp}
            title={t("settings.desktop.behavior.title")}
          >
            <div className="space-y-3">
              {!isDesktopRuntime ? (
                <p className="rounded-[16px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.24)] px-3 py-2 text-xs leading-5 text-app-muted">
                  {t("settings.desktop.webOnlyNote")}
                </p>
              ) : null}
              {isDesktopRuntime ? (
                <p className="rounded-[16px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.24)] px-3 py-2 text-xs leading-5 text-app-muted">
                  {t("settings.desktop.nativeTrayControlNote")}
                </p>
              ) : null}
              <ToggleRow
                checked={desktopStreamerModeEnabled}
                description={t("settings.notifications.streamerMode.description")}
                disabled={!isDesktopRuntime}
                label={t("settings.notifications.streamerMode.title")}
                onChange={setDesktopStreamerModeEnabled}
                testId="settings-desktop-streamer-mode"
              />
              <ToggleRow
                checked={desktopStreamerModeProcessDetectionEnabled}
                description={t("settings.notifications.streamerMode.processDetection.description")}
                disabled={!isDesktopRuntime}
                label={t("settings.notifications.streamerMode.processDetection.title")}
                onChange={setDesktopStreamerModeProcessDetectionEnabled}
                testId="settings-desktop-streamer-mode-process-detection"
              />
              <ToggleRow
                checked={desktopRichPresenceEnabled}
                description={t("settings.notifications.richPresence.description")}
                disabled={!isDesktopRuntime}
                label={t("settings.notifications.richPresence.title")}
                onChange={setDesktopRichPresenceEnabled}
                testId="settings-desktop-rich-presence"
              />
              <AccountPreferenceSelectRow<DesktopRichPresenceAudience>
                description={t("settings.notifications.richPresence.audience.description")}
                disabled={!isDesktopRuntime || !desktopRichPresenceEnabled}
                icon={Eye}
                labelForValue={(value) =>
                  t(`settings.notifications.richPresence.audience.${value}`)
                }
                onChange={setDesktopRichPresenceAudience}
                options={DESKTOP_RICH_PRESENCE_AUDIENCE_OPTIONS}
                title={t("settings.notifications.richPresence.audience.title")}
                value={desktopRichPresenceAudience}
              />
            </div>
          </SettingCard>
        ) : null}

        {showVoice || showDiagnostics ? (
          <SettingsVoiceProviderBoundary account={accountState}>
            <div className="space-y-3">
              {showVoice ? (
                <SettingCard
                  description={t("settings.desktop.voice.description")}
                  icon={Gamepad2}
                  title={t("settings.desktop.voice.title")}
                >
                  <VoicePreferencesPanel mode="desktop" />
                </SettingCard>
              ) : null}

              {showDiagnostics ? (
                <SettingCard
                  description={t("settings.desktop.diagnostics.description")}
                  icon={Info}
                  title={t("settings.desktop.diagnostics.title")}
                >
                  <DesktopDiagnosticsPanel />
                </SettingCard>
              ) : null}
            </div>
          </SettingsVoiceProviderBoundary>
        ) : null}
      </div>
    );
  };

  const renderAdvancedControls = (target: "all" | "appIcon") => {
    const showAppIcon = target === "all" || target === "appIcon";

    return (
      <div className="space-y-3">
        {target === "all" ? (
          <SettingCard
            description={t("settings.appearance.advanced.description")}
            icon={LayoutPanelTop}
            title={t("settings.appearance.advanced.title")}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <InfoPill
                label={t("settings.appearance.icons.title")}
                value={t("settings.appearance.icons.description")}
              />
            </div>
          </SettingCard>
        ) : null}

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
                      "group min-w-0 rounded-[18px] border p-3 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[hsl(var(--border)/0.65)] bg-[linear-gradient(145deg,hsl(var(--surface-card)),hsl(var(--surface-soft)/0.44))] p-1.5 shadow-inner">
                        <Image
                          alt=""
                          className="h-8 w-8 object-contain transition group-hover:scale-105"
                          height={32}
                          src={icon.src}
                          width={32}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-app-foreground">
                          {t(icon.labelKey)}
                        </p>
                        <p className="mt-0.5 text-xs leading-4 text-app-muted">
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
                className="mt-3 rounded-[16px] border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.08)] px-3 py-2 text-xs text-[hsl(var(--success))]"
                data-testid="app-icon-feedback"
              >
                <p className="font-semibold">{t("settings.appearance.icons.updated")}</p>
                <p className="mt-0.5 leading-4 text-app-muted">
                  {t("settings.appearance.icons.updatedDescription")}
                </p>
              </div>
            ) : null}
          </SettingCard>
        ) : null}
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
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {MESSAGE_FONT_OPTIONS.map((option) => {
          const isSelected = option.id === selectedMessageFont;

          return (
            <button
              aria-pressed={isSelected}
              className={cn(
                "group min-h-28 rounded-[18px] border p-3 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
              <p className="mt-3 text-xl font-semibold tracking-tight text-app-foreground">
                {t("settings.appearance.messageFont.preview")}
              </p>
              <p className="mt-2 text-xs leading-5 text-app-muted">
                {t("settings.appearance.messageFont.sample")}
              </p>
            </button>
          );
        })}
      </div>
      <p className="mt-3 rounded-[16px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.28)] px-3 py-2 text-xs leading-5 text-app-muted">
        {t("settings.appearance.messageFont.note")}
      </p>
    </SettingCard>
  );

  const renderAppearanceSection = () => {
    return (
      <div className="space-y-3">
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

        {panel === null ? renderAdvancedControls("appIcon") : null}

        {panel === "advanced" ? renderAdvancedControls("all") : null}
        {panel === "appIcon" ? renderAdvancedControls("appIcon") : null}
      </div>
    );
  };

  const renderNotificationsSection = () => {
    const showGeneral = panel === null || panel === "general";
    const showSounds = panel === null || panel === "sounds";

    return (
      <div className="space-y-3">
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
            <div className="space-y-3">
              <div className="rounded-[16px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.22)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-app-foreground text-xs font-semibold">
                    {t("appearance.notifications.count")}
                  </label>
                  <div className="app-panel-soft inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5">
                    <span className="text-app-foreground text-xs font-semibold">
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

              <div className="rounded-[16px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.22)] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-app-foreground text-xs font-semibold">
                    {t("appearance.notifications.duration")}
                  </label>
                  <div className="app-panel-soft inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5">
                    <span className="text-app-foreground text-xs font-semibold">
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
                <p className="text-app-muted mt-3 text-xs leading-5">
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
            <div className="space-y-3">
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
              <p className="text-app-muted rounded-[16px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.22)] px-3 py-2 text-xs leading-5">
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
    const showDeveloper = panel === null || panel === "developer";
    const featuredContributor = buildInfo.contributors.find(
      (contributor) => contributor === FEATURED_CONTRIBUTOR_NAME,
    );
    const contributorList = featuredContributor
      ? buildInfo.contributors.filter((contributor) => contributor !== featuredContributor)
      : buildInfo.contributors;
    const unknownBuildValue = t("settings.about.buildInfo.unknown");
    const desktopVersion = formatNativeVersion(desktopAppInfo?.appVersion) ?? unknownBuildValue;
    const desktopBuildTime = formatSettingsBuildTime(desktopAppInfo?.buildTime, locale);
    const desktopReleaseRing = desktopAppInfo?.releaseRing?.trim() || unknownBuildValue;
    const desktopUpdaterState = desktopAppInfo
      ? t(
          desktopAppInfo.updaterEnabled
            ? "settings.about.buildInfo.desktopUpdaterEnabled"
            : "settings.about.buildInfo.desktopUpdaterDisabled",
        )
      : unknownBuildValue;

    return (
      <div className="space-y-3">
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
            <div className="space-y-2.5">
              <p className="text-app-muted text-xs leading-6">
                {t("settings.about.overview.body")}
              </p>
              <p className="text-app-muted text-xs leading-6">
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
            <div className="space-y-3">
              <div className="grid gap-2.5 md:grid-cols-2">
                <InfoPill
                  label={t("settings.about.buildInfo.webVersion")}
                  value={buildInfo.version}
                />
                {isDesktopRuntime ? (
                  <InfoPill
                    label={t("settings.about.buildInfo.desktopVersion")}
                    value={desktopVersion}
                  />
                ) : null}
                <InfoPill
                  label={t("settings.about.buildInfo.lastUpdate")}
                  value={buildInfo.lastUpdated}
                />
                <InfoPill label={t("settings.about.buildInfo.buildId")} value={buildInfo.buildId} />
                <InfoPill
                  label={t("settings.about.buildInfo.releaseChannel")}
                  value={buildInfo.releaseChannel}
                />
                {isDesktopRuntime ? (
                  <>
                    <InfoPill
                      label={t("settings.about.buildInfo.desktopReleaseRing")}
                      value={desktopReleaseRing}
                    />
                    <InfoPill
                      label={t("settings.about.buildInfo.desktopUpdater")}
                      value={desktopUpdaterState}
                    />
                  </>
                ) : null}
                <InfoPill
                  label={t("settings.about.buildInfo.webBuildTime")}
                  value={buildInfo.buildTime || t("settings.about.buildInfo.developmentBuild")}
                />
                {isDesktopRuntime ? (
                  <InfoPill
                    label={t("settings.about.buildInfo.desktopBuildTime")}
                    value={desktopBuildTime || t("settings.about.buildInfo.developmentBuild")}
                  />
                ) : null}
              </div>

              <div className="app-panel-soft inline-flex max-w-full flex-wrap items-center gap-2 rounded-[16px] border px-3 py-2 text-[11px] font-semibold text-app-muted shadow-[0_10px_24px_hsl(var(--shadow-color)/0.05)]">
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
            <div className="grid gap-2.5">
              {buildInfo.notes.map((note) => (
                <article
                  className="app-panel-soft rounded-[18px] border p-3 shadow-[0_10px_24px_hsl(var(--shadow-color)/0.04)]"
                  key={note.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
                        {t(note.categoryKey)}
                      </p>
                      <h4 className="mt-1.5 text-[15px] font-semibold text-app-foreground">
                        {t(note.titleKey)}
                      </h4>
                    </div>
                    <span className="rounded-full border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.1)] px-2.5 py-0.5 text-[10px] font-bold text-[hsl(var(--primary))]">
                      v{buildInfo.version}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-app-muted">{t(note.descriptionKey)}</p>
                </article>
              ))}
            </div>
          </SettingCard>
        ) : null}

        {showDeveloper ? (
          <SettingCard
            description={t("settings.about.developer.description")}
            icon={UserRound}
            title={t("settings.about.developer.title")}
          >
            <div className="space-y-3">
              <InfoPill
                label={t("settings.about.developer.name")}
                value={buildInfo.developerName}
              />

              <div className="app-panel-soft rounded-[18px] border p-3">
                <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.18em]">
                  {t("settings.about.developer.contributors")}
                </p>
                <p className="text-app-muted mt-1.5 text-xs leading-5">
                  {t("settings.about.developer.contributorsDescription")}
                </p>

                {featuredContributor ? (
                  <div className="relative mt-3 overflow-hidden rounded-[18px] border border-[hsl(var(--primary)/0.28)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),hsl(var(--surface)/0.9)_54%,hsl(var(--accent)/0.14))] p-3 shadow-[0_18px_48px_hsl(var(--primary)/0.12)]">
                    <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full bg-[hsl(var(--primary)/0.18)] blur-3xl" />
                    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--surface)/0.78)] text-xs font-bold text-[hsl(var(--primary))] shadow-inner">
                          OG
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
                            {t("settings.about.developer.featuredContributor")}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-semibold text-app-foreground">
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

                <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                  {contributorList.map((contributor) => (
                    <div className="app-panel rounded-[15px] border px-3 py-2" key={contributor}>
                      <p className="text-xs font-medium text-app-foreground">{contributor}</p>
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
      className={cn(
        "min-w-0 max-w-full space-y-3 overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:pb-0",
        className,
      )}
      data-client-ready={clientReady ? "true" : "false"}
      data-testid="settings-panel"
    >
      {section === "account" ? renderAccountSection() : null}
      {section === "voice" ? renderVoiceSection() : null}
      {section === "desktop" ? renderDesktopSection() : null}
      {section === "appearance" ? renderAppearanceSection() : null}
      {section === "notifications" ? renderNotificationsSection() : null}
      {section === "about" ? renderAboutSection() : null}
    </div>
  );
}
