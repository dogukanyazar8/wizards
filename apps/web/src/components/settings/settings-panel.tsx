"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Camera,
  ChevronRight,
  ImageIcon,
  Info,
  Languages,
  LayoutPanelTop,
  Mail,
  MonitorUp,
  Sparkles,
  UserRound,
  Volume2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { UserStatus } from "@wizards/db";
import { Button } from "@wizards/ui";
import { useShallow } from "zustand/react/shallow";
import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { useI18n } from "@/components/providers/locale-provider";
import { ThemePicker } from "@/components/theme/theme-picker";
import { Badge } from "@/components/ui/badge";
import { VoicePreferencesPanel } from "@/components/voice/voice-preferences-panel";
import {
  CHANNEL_SIDEBAR_WIDTH_STEP,
  DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  DEFAULT_MAIN_PANEL_WIDTH,
  DEFAULT_SERVER_RAIL_WIDTH,
  MAX_CHANNEL_SIDEBAR_WIDTH,
  MAX_MAIN_PANEL_WIDTH,
  MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  MAX_SERVER_RAIL_WIDTH,
  MIN_CHANNEL_SIDEBAR_WIDTH,
  MIN_MAIN_PANEL_WIDTH,
  MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  MIN_SERVER_RAIL_WIDTH,
  NOTIFICATION_LIMIT_OPTIONS,
  NOTIFICATION_POPUP_TIMEOUT_STEP,
  MAIN_PANEL_WIDTH_STEP,
  SERVER_RAIL_WIDTH_STEP,
} from "@/lib/appearance";
import { APP_ICON_OPTIONS, type AppIconId } from "@/lib/app-icons";
import {
  type AccountSettingsState,
  type UpdateAccountSettingsResult,
  updateAccountSettingsAction,
} from "@/lib/account/actions";
import {
  fetchLayoutSettings,
  patchLayoutSettings,
  settingsQueryKeys,
} from "@/lib/settings/client";
import {
  buildSettingsHref,
  resolveSettingsSelection,
  type SettingsPanelKey,
} from "@/lib/settings/navigation";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { SOUND_EFFECT_PATHS, useSoundStore, type SoundEffectKey } from "@/store/sound-store";

const NOTIFICATION_SOUND_OPTIONS = ["default", "soft", "pulse"] as const;
const FEATURED_CONTRIBUTOR_NAME = "O\u011Fuz G\u00FC\u011F\u00FCmc\u00FCo\u011Flu";

type NotificationSoundOption = (typeof NOTIFICATION_SOUND_OPTIONS)[number];

type SettingsPanelProps = {
  buildInfo: {
    contributors: string[];
    developerName: string;
    lastUpdated: string;
    version: string;
  };
  initialAccount: AccountSettingsState;
};

type AccountField = "displayName" | "email" | "status" | "username";

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
      <h2 className="text-app-foreground mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
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
        {badge ? <Badge className="shrink-0" tone="muted">{badge}</Badge> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InfoPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (nextValue: boolean) => void;
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
  onVolumeChange,
  previewLabel,
  volume,
  volumeLabel,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (nextValue: boolean) => void;
  onPreview: () => void;
  onVolumeChange: (nextValue: number) => void;
  previewLabel: string;
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

      <div className="mt-4">
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
          max={100}
          min={0}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          step={1}
          type="range"
          value={volume}
        />
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
  title: string;
  value: number;
}) {
  return (
    <SettingCard
      description={description}
      icon={LayoutPanelTop}
      title={title}
    >
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
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="range"
          value={value}
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

function ComingSoonCard({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="app-panel-soft rounded-[24px] border border-dashed p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-[hsl(var(--primary)/0.12)] p-2 text-[hsl(var(--primary))]">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-foreground">{title}</p>
          <p className="text-app-muted mt-1 text-sm leading-6">{description}</p>
        </div>
      </div>
    </div>
  );
}

function StatusDot({
  status,
}: {
  status: UserStatus;
}) {
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

export function SettingsPanel({
  buildInfo,
  initialAccount,
}: SettingsPanelProps) {
  const { t } = useI18n();
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
  const [accountFieldErrors, setAccountFieldErrors] = useState<
    Partial<Record<AccountField, string>>
  >({});
  const [isSavingAccount, startSavingAccount] = useTransition();
  const {
    applyPersistedSettings,
    appIconId,
    channelSidebarWidth,
    mainPanelWidth,
    notificationAutoClose,
    notificationLimit,
    notificationPopupTimeoutSeconds,
    resetChannelSidebarWidth,
    resetMainPanelWidth,
    resetServerRailWidth,
    serverRailWidth,
    setAppIconId,
    setChannelSidebarWidth,
    setMainPanelWidth,
    setNotificationAutoClose,
    setNotificationLimit,
    setNotificationPopupTimeoutSeconds,
    setServerRailWidth,
  } = useAppStore(
    useShallow((state) => ({
      applyPersistedSettings: state.applyPersistedSettings,
      appIconId: state.appIconId,
      channelSidebarWidth: state.channelSidebarWidth,
      mainPanelWidth: state.mainPanelWidth,
      notificationAutoClose: state.notificationAutoClose,
      notificationLimit: state.notificationLimit,
      notificationPopupTimeoutSeconds: state.notificationPopupTimeoutSeconds,
      resetChannelSidebarWidth: state.resetChannelSidebarWidth,
      resetMainPanelWidth: state.resetMainPanelWidth,
      resetServerRailWidth: state.resetServerRailWidth,
      serverRailWidth: state.serverRailWidth,
      setAppIconId: state.setAppIconId,
      setChannelSidebarWidth: state.setChannelSidebarWidth,
      setMainPanelWidth: state.setMainPanelWidth,
      setNotificationAutoClose: state.setNotificationAutoClose,
      setNotificationLimit: state.setNotificationLimit,
      setNotificationPopupTimeoutSeconds: state.setNotificationPopupTimeoutSeconds,
      setServerRailWidth: state.setServerRailWidth,
    })),
  );
  const {
    notificationVolume,
    setNotificationVolume,
    setVoiceJoinEnabled,
    setVoiceJoinVolume,
    setVoiceLeaveEnabled,
    setVoiceLeaveVolume,
    voiceJoinEnabled,
    voiceJoinVolume,
    voiceLeaveEnabled,
    voiceLeaveVolume,
  } = useSoundStore(
    useShallow((state) => ({
      notificationVolume: state.notificationVolume,
      setNotificationVolume: state.setNotificationVolume,
      setVoiceJoinEnabled: state.setVoiceJoinEnabled,
      setVoiceJoinVolume: state.setVoiceJoinVolume,
      setVoiceLeaveEnabled: state.setVoiceLeaveEnabled,
      setVoiceLeaveVolume: state.setVoiceLeaveVolume,
      voiceJoinEnabled: state.voiceJoinEnabled,
      voiceJoinVolume: state.voiceJoinVolume,
      voiceLeaveEnabled: state.voiceLeaveEnabled,
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
  }, [panel, section]);

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

  const previewSound = useCallback((effect: SoundEffectKey, volume: number) => {
    const audio = new Audio(SOUND_EFFECT_PATHS[effect]);
    audio.volume = Math.min(1, Math.max(0, volume / 100));
    audio.play().catch(() => {
      // The preview is user-triggered, but browsers may still reject playback.
    });
  }, []);

  const handleServerRailWidthChange = useCallback(
    (nextValue: number) => {
      setServerRailWidth(nextValue);
      queryClient.setQueryData<UserLayoutSettings | undefined>(
        settingsQueryKeys.layout,
        (current) => (current ? { ...current, serverRailWidth: nextValue } : current),
      );
    },
    [queryClient, setServerRailWidth],
  );

  const handleMainCanvasWidthChange = useCallback(
    (nextValue: number) => {
      setMainPanelWidth(nextValue);
    },
    [setMainPanelWidth],
  );

  const handleChannelSidebarWidthChange = useCallback(
    (nextValue: number) => {
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
      NOTIFICATION_SOUND_OPTIONS.map((option) => ({
        label: t(`settings.notifications.soundProfile.${option}`),
        value: option,
      })),
    [t],
  );

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
      const result = (await updateAccountSettingsAction(accountDraft)) as UpdateAccountSettingsResult;

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
      setAccountFieldErrors({});
      setAccountFeedback({
        tone: "success",
        value: t("settings.account.saved"),
      });
      setIsEditingAccount(false);
    });
  };

  const renderAccountSection = () => {
    const visibleName = accountState.displayName?.trim() || accountState.username;

    return (
      <div className="space-y-6">
        <SectionHero
          badge={t("settings.account.badge")}
          description={t("settings.account.description")}
          title={t("settings.account.title")}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <SettingCard
            description={t("settings.account.summaryDescription")}
            icon={UserRound}
            title={t("settings.account.summaryTitle")}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,hsl(var(--primary)/0.28),hsl(var(--primary)/0.12))] text-lg font-semibold text-app-foreground sm:h-20 sm:w-20 sm:rounded-[26px] sm:text-xl">
                  {buildAvatarFallback(accountState)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-lg font-semibold text-app-foreground sm:text-xl">{visibleName}</p>
                    <StatusDot status={accountState.status} />
                  </div>
                  <p className="mt-1 text-sm text-app-muted">@{accountState.username}</p>
                  <p className="mt-2 text-sm text-app-muted">{accountState.email}</p>
                </div>
              </div>

              <Button className="w-full sm:w-auto" onClick={() => setIsEditingAccount(true)} type="button" variant="outline">
                {t("common.edit")}
              </Button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <InfoPill label={t("settings.account.fields.displayName")} value={visibleName} />
              <InfoPill label={t("common.username")} value={`@${accountState.username}`} />
              <InfoPill label={t("common.email")} value={accountState.email} />
              <InfoPill
                label={t("settings.account.fields.status")}
                value={t(
                  accountState.status === UserStatus.INVISIBLE
                    ? "settings.account.status.invisible"
                    : `friends.status.${accountState.status.toLowerCase()}`,
                )}
              />
            </div>
          </SettingCard>

          <SettingCard
            description={t("settings.account.editDescription")}
            icon={Mail}
            title={t("settings.account.editTitle")}
          >
            {isEditingAccount ? (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-app-foreground">
                    {t("settings.account.fields.displayName")}
                  </span>
                  <input
                    className="app-panel w-full rounded-2xl border px-4 py-3 text-sm text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    onChange={(event) =>
                      handleAccountDraftChange("displayName", event.target.value)
                    }
                    type="text"
                    value={accountDraft.displayName ?? ""}
                  />
                  {accountFieldErrors.displayName ? (
                    <p className="mt-2 text-xs text-app-danger">{t(accountFieldErrors.displayName)}</p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-app-foreground">
                    {t("common.username")}
                  </span>
                  <input
                    className="app-panel w-full rounded-2xl border px-4 py-3 text-sm text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    onChange={(event) =>
                      handleAccountDraftChange("username", event.target.value)
                    }
                    type="text"
                    value={accountDraft.username}
                  />
                  {accountFieldErrors.username ? (
                    <p className="mt-2 text-xs text-app-danger">{t(accountFieldErrors.username)}</p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-app-foreground">
                    {t("common.email")}
                  </span>
                  <input
                    className="app-panel w-full rounded-2xl border px-4 py-3 text-sm text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    onChange={(event) => handleAccountDraftChange("email", event.target.value)}
                    type="email"
                    value={accountDraft.email}
                  />
                  {accountFieldErrors.email ? (
                    <p className="mt-2 text-xs text-app-danger">{t(accountFieldErrors.email)}</p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-app-foreground">
                    {t("settings.account.fields.status")}
                  </span>
                  <select
                    className="app-panel w-full rounded-2xl border px-4 py-3 text-sm text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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

                {accountFeedback ? (
                  <p
                    className={cn(
                      "text-sm",
                      accountFeedback.tone === "success" ? "text-app-success" : "text-app-danger",
                    )}
                  >
                    {accountFeedback.value}
                  </p>
                ) : null}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <Button className="w-full sm:w-auto" onClick={cancelAccountEditing} type="button" variant="outline">
                    {t("common.cancel")}
                  </Button>
                  <Button className="w-full sm:w-auto" disabled={isSavingAccount} onClick={saveAccount} type="button">
                    {isSavingAccount ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="app-panel-soft rounded-[24px] border p-4">
                  <p className="text-sm font-semibold text-app-foreground">
                    {t("settings.account.editHintTitle")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-app-muted">
                    {t("settings.account.editHintDescription")}
                  </p>
                </div>
                {accountFeedback ? (
                  <p className="text-sm text-app-success">{accountFeedback.value}</p>
                ) : null}
              </div>
            )}
          </SettingCard>
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

        {showAudio ? <VoicePreferencesPanel /> : null}

        {showCamera ? (
          <SettingCard
            badge="Phase 8"
            description={t("settings.voice.camera.description")}
            icon={Camera}
            title={t("settings.voice.camera.title")}
          >
            <ComingSoonCard
              description={t("settings.voice.camera.description")}
              title={t("settings.voice.camera.title")}
            />
          </SettingCard>
        ) : null}

        {showScreenShare ? (
          <SettingCard
            badge="Phase 8"
            description={t("settings.voice.screenShare.description")}
            icon={MonitorUp}
            title={t("settings.voice.screenShare.title")}
          >
            <ComingSoonCard
              description={t("settings.voice.screenShare.description")}
              title={t("settings.voice.screenShare.title")}
            />
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
              <div className="mt-4 rounded-[22px] border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.08)] px-4 py-3 text-sm text-[hsl(var(--success))]">
                <p className="font-semibold">{t("settings.appearance.icons.updated")}</p>
                <p className="mt-1 leading-6 text-app-muted">
                  {t("settings.appearance.icons.updatedDescription")}
                </p>
              </div>
            ) : null}
          </SettingCard>
        ) : null}

        {showServerRail ? (
          <RangeSliderCard
            description={t("appearance.serverRail.title")}
            labels={[
              t("appearance.serverRail.compact"),
              t("appearance.serverRail.balanced"),
              t("appearance.serverRail.spacious"),
            ]}
            max={MAX_SERVER_RAIL_WIDTH}
            min={MIN_SERVER_RAIL_WIDTH}
            onChange={handleServerRailWidthChange}
            preview={
              <div className="app-panel-soft rounded-[24px] border p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="app-panel-soft shrink-0 rounded-[22px] border p-3"
                    style={{ width: `min(${Math.max(72, serverRailWidth)}px, 28vw)` }}
                  >
                    <div className="mx-auto h-10 w-10 rounded-[16px] bg-[hsl(var(--primary)/0.18)]" />
                  </div>
                  <div className="app-panel min-w-0 flex-1 rounded-[22px] border p-4">
                    <div className="h-4 w-32 rounded-full bg-[hsl(var(--surface-soft))]" />
                    <div className="mt-3 h-3 w-20 rounded-full bg-[hsl(var(--surface-soft)/0.8)]" />
                  </div>
                </div>
              </div>
            }
            step={SERVER_RAIL_WIDTH_STEP}
            title={t("settings.appearance.advanced.serverRailTitle")}
            value={serverRailWidth}
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
                    style={{ width: `${Math.max(72, serverRailWidth)}px` }}
                  >
                    <div className="mx-auto h-10 w-10 rounded-[16px] bg-[hsl(var(--primary)/0.18)]" />
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
            title={t("settings.appearance.advanced.channelSidebarTitle")}
            value={channelSidebarWidth}
          />
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            disabled={
              serverRailWidth === DEFAULT_SERVER_RAIL_WIDTH &&
              channelSidebarWidth === DEFAULT_CHANNEL_SIDEBAR_WIDTH &&
              mainPanelWidth === DEFAULT_MAIN_PANEL_WIDTH
            }
            onClick={() => {
              resetServerRailWidth();
              resetChannelSidebarWidth();
              resetMainPanelWidth();
            }}
            type="button"
            variant="outline"
          >
            {t("appearance.resetLayout")}
          </Button>
        </div>
      </div>
    );
  };

  const renderAppearanceSection = () => {
    return (
      <div className="space-y-6">
        <SectionHero
          badge={t("settings.groups.appearance.badge")}
          description={t("settings.groups.appearance.description")}
          title={t("settings.groups.appearance.title")}
        />

        {(panel === null || panel === "language") ? (
          <SettingCard
            description={t("settings.appearance.language.description")}
            icon={Languages}
            title={t("settings.appearance.language.title")}
          >
            <LanguageSwitcher persistSelection showMeta variant="panel" />
          </SettingCard>
        ) : null}

        {(panel === null || panel === "theme") ? (
          <SettingCard
            description={t("settings.appearance.theme.description")}
            icon={Sparkles}
            title={t("settings.appearance.theme.title")}
          >
            <ThemePicker persistSelection />
          </SettingCard>
        ) : null}

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
              />
              <ToggleRow
                checked={serverSettings?.desktopNotifications ?? true}
                description={t("settings.notifications.desktop.description")}
                label={t("settings.notifications.desktop.title")}
                onChange={(nextValue) => updateServerSettings({ desktopNotifications: nextValue })}
              />
              <ToggleRow
                checked={serverSettings?.mobileNotifications ?? true}
                description={t("settings.notifications.mobile.description")}
                label={t("settings.notifications.mobile.title")}
                onChange={(nextValue) => updateServerSettings({ mobileNotifications: nextValue })}
              />
              <ToggleRow
                checked={serverSettings?.emailNotifications ?? false}
                description={t("settings.notifications.email.description")}
                label={t("settings.notifications.email.title")}
                onChange={(nextValue) => updateServerSettings({ emailNotifications: nextValue })}
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
                onPreview={() => previewSound("notification", notificationVolume)}
                onVolumeChange={setNotificationVolume}
                previewLabel={t("settings.notifications.sound.preview")}
                volume={notificationVolume}
                volumeLabel={t("settings.notifications.sound.volume")}
              />
              <SoundVolumeRow
                checked={voiceJoinEnabled}
                description={t("settings.notifications.voiceJoinSound.description")}
                label={t("settings.notifications.voiceJoinSound.title")}
                onChange={setVoiceJoinEnabled}
                onPreview={() => previewSound("voiceJoin", voiceJoinVolume)}
                onVolumeChange={setVoiceJoinVolume}
                previewLabel={t("settings.notifications.sound.preview")}
                volume={voiceJoinVolume}
                volumeLabel={t("settings.notifications.sound.volume")}
              />
              <SoundVolumeRow
                checked={voiceLeaveEnabled}
                description={t("settings.notifications.voiceLeaveSound.description")}
                label={t("settings.notifications.voiceLeaveSound.title")}
                onChange={setVoiceLeaveEnabled}
                onPreview={() => previewSound("voiceLeave", voiceLeaveVolume)}
                onVolumeChange={setVoiceLeaveVolume}
                previewLabel={t("settings.notifications.sound.preview")}
                volume={voiceLeaveVolume}
                volumeLabel={t("settings.notifications.sound.volume")}
              />
              <div className="app-panel-soft rounded-[24px] border p-4">
                <label
                  className="text-sm font-semibold text-app-foreground"
                  htmlFor="notification-sound-profile"
                >
                  {t("settings.notifications.soundProfile.title")}
                </label>
                <p className="text-app-muted mt-1 text-sm leading-6">
                  {t("settings.notifications.soundProfile.description")}
                </p>
                <select
                  className="app-panel mt-4 w-full rounded-2xl border px-4 py-3 text-sm text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  disabled={!serverSettings?.notificationSound}
                  id="notification-sound-profile"
                  onChange={(event) =>
                    updateServerSettings({
                      notificationSoundFile: event.target.value as NotificationSoundOption,
                    })
                  }
                  value={serverSettings?.notificationSoundFile ?? "default"}
                >
                  {soundProfileOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
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
            <div className="grid gap-3 md:grid-cols-2">
              <InfoPill label={t("settings.about.buildInfo.version")} value={buildInfo.version} />
              <InfoPill
                label={t("settings.about.buildInfo.lastUpdate")}
                value={buildInfo.lastUpdated}
              />
            </div>
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
                    <div
                      className="app-panel rounded-[20px] border px-4 py-3"
                      key={contributor}
                    >
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
    <div className="min-w-0 max-w-full space-y-6 overflow-hidden">
      {section === "account" ? renderAccountSection() : null}
      {section === "voice" ? renderVoiceSection() : null}
      {section === "appearance" ? renderAppearanceSection() : null}
      {section === "notifications" ? renderNotificationsSection() : null}
      {section === "about" ? renderAboutSection() : null}
    </div>
  );
}
