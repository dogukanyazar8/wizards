"use client";

import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useI18n } from "@/components/providers/locale-provider";
import {
  ServerModalShell,
  serverModalPlainFooterStyle,
  serverModalPrimaryButtonStyle,
  serverModalSecondaryButtonStyle,
} from "@/components/servers/modals/server-modal-shell";
import {
  CHANNEL_NOTIFICATION_OPTIONS,
  hasChannelNotificationChange,
  selectChannelNotificationLevel,
  stepChannelNotificationLevel,
  toChannelNotificationDraft,
  toChannelNotificationPayload,
  toggleChannelNotificationMobileMute,
  type ChannelNotificationDraft,
  type ChannelNotificationLevel,
  type ChannelNotificationOption,
} from "@/lib/servers/channel-notifications";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import {
  fetchChannelNotificationSettings,
  updateChannelNotificationSettings,
} from "@/lib/workspace/client";

/**
 * SPEC-SUNUCU §6.4 — kanal bildirimleri penceresi (460).
 *
 * Üç radyo + bir anahtar. Kaydedince kanal başlığındaki durum çipi ve zil rengi de değişir:
 * pencere kendi kopyasını tutmaz, `chat-area`in okuduğu **aynı** sorgu anahtarına
 * (`["workspace", "channel", id, "notification-settings"]`) yazar. İkinci bir kaynak, iki
 * ayrı gerçek üretirdi.
 *
 * Ayak ortak pencere ayağının düzeninde **değil** (sözlükteki `SPEC_DEVIATIONS` başlığı):
 * üst kenarı ve zemini yok, boşluğu `16px 22px 18px`.
 */

const { notificationsModal } = SERVER_METRICS;

const OPTION_ICON_PATHS: Record<ChannelNotificationLevel, string> = {
  all: "M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 20a2 2 0 0 0 3 0",
  mentions: "M12 21a9 9 0 1 1 9-9v1.5a2.5 2.5 0 0 1-5 0V12a4 4 0 1 0-1.2 2.9",
  muted: "M4 4l16 16M18 8a6 6 0 0 0-9.3-5M6 10v4l-2 3h12",
};

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={pxToEm(19)}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.9}
      viewBox="0 0 24 24"
      width={pxToEm(19)}
    >
      <path d={OPTION_ICON_PATHS.all} />
    </svg>
  );
}

export type ChannelNotificationsModalViewProps = {
  readonly channelName: string;
  readonly draft: ChannelNotificationDraft;
  readonly onCancel: () => void;
  readonly onSelect: (level: ChannelNotificationLevel) => void;
  readonly onSubmit: () => void;
  readonly onToggleMobileMute: () => void;
  readonly saveDisabled: boolean;
};

function optionRowStyle(selected: boolean): React.CSSProperties {
  return {
    background: selected ? "hsl(var(--primary)/0.08)" : "hsl(var(--surface-base))",
    borderColor: selected ? "hsl(var(--primary))" : `hsl(var(--border)/0.7)`,
    borderRadius: pxToRem(notificationsModal.optionRadius),
    borderWidth: hairline(notificationsModal.optionBorderWidth),
    gap: pxToRem(notificationsModal.optionGap),
    paddingBlock: pxToRem(notificationsModal.optionPaddingY),
    paddingInline: pxToRem(notificationsModal.optionPaddingX),
  };
}

function optionIconStyle(
  option: ChannelNotificationOption,
  selected: boolean,
): React.CSSProperties {
  return {
    background: selected ? `hsl(var(--${option.tone})/0.16)` : "hsl(var(--surface-soft))",
    borderRadius: pxToRem(notificationsModal.optionIconRadius),
    color: selected ? `hsl(var(--${option.tone}))` : "hsl(var(--text-muted))",
    height: pxToRem(notificationsModal.optionIconSize),
    width: pxToRem(notificationsModal.optionIconSize),
  };
}

export function ChannelNotificationsModalView({
  channelName,
  draft,
  onCancel,
  onSelect,
  onSubmit,
  onToggleMobileMute,
  saveDisabled,
}: ChannelNotificationsModalViewProps) {
  const { t } = useI18n();
  const groupRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;

    if (direction === 0) {
      return;
    }

    event.preventDefault();
    const next = stepChannelNotificationLevel(draft.level, direction);
    onSelect(next);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-level="${next}"]`)?.focus();
  };

  return (
    <div data-testid="channel-notifications-modal-body">
      <div
        aria-label={t("server.modal.notifications.groupLabel")}
        className="flex flex-col"
        onKeyDown={handleKeyDown}
        ref={groupRef}
        role="radiogroup"
        style={{
          gap: pxToRem(notificationsModal.listGap),
          paddingBottom: pxToRem(notificationsModal.listPaddingBottom),
        }}
      >
        {CHANNEL_NOTIFICATION_OPTIONS.map((option) => {
          const selected = option.id === draft.level;

          return (
            <button
              aria-checked={selected}
              className="flex items-center border text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-level={option.id}
              data-testid={`channel-notifications-option-${option.id}`}
              key={option.id}
              onClick={() => onSelect(option.id)}
              role="radio"
              style={optionRowStyle(selected)}
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <span
                aria-hidden="true"
                className="grid flex-none place-items-center"
                style={optionIconStyle(option, selected)}
              >
                <svg
                  fill="none"
                  height={pxToEm(16, 13.5)}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.9}
                  viewBox="0 0 24 24"
                  width={pxToEm(16, 13.5)}
                >
                  <path d={OPTION_ICON_PATHS[option.id]} />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block font-semibold text-[hsl(var(--foreground))]"
                  style={{
                    fontSize: pxToRem(notificationsModal.optionTitleFontSize),
                    lineHeight: notificationsModal.optionTitleLineHeight,
                  }}
                >
                  {t(option.titleKey)}
                </span>
                <span
                  className="block text-[hsl(var(--text-muted))]"
                  style={{
                    fontSize: pxToRem(notificationsModal.optionDescriptionFontSize),
                    lineHeight: notificationsModal.optionDescriptionLineHeight,
                    marginTop: pxToRem(notificationsModal.optionDescriptionMarginTop),
                  }}
                >
                  {t(option.descriptionKey)}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="grid flex-none place-items-center rounded-full"
                style={{
                  background: selected ? "hsl(var(--primary))" : "transparent",
                  borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border))",
                  borderWidth: hairline(notificationsModal.optionRadioBorderWidth),
                  color: "hsl(var(--primary-foreground))",
                  height: pxToRem(notificationsModal.optionRadioSize),
                  width: pxToRem(notificationsModal.optionRadioSize),
                }}
              >
                {selected ? (
                  <svg
                    fill="none"
                    height={pxToEm(11, 13.5)}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth={3}
                    viewBox="0 0 24 24"
                    width={pxToEm(11, 13.5)}
                  >
                    <path d="M4 12.5 9 17.5 20 6.5" />
                  </svg>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="flex items-center"
        style={{
          background: `hsl(var(--surface-soft)/${notificationsModal.muteRowBackgroundAlpha})`,
          borderRadius: pxToRem(notificationsModal.muteRowRadius),
          gap: pxToRem(notificationsModal.muteRowGap),
          marginTop: pxToRem(notificationsModal.muteRowMarginTop),
          paddingBlock: pxToRem(notificationsModal.muteRowPaddingY),
          paddingInline: pxToRem(notificationsModal.muteRowPaddingX),
        }}
      >
        <span
          className="min-w-0 flex-1 font-medium text-[hsl(var(--text-secondary))]"
          id="channel-notifications-mobile-mute-label"
          style={{
            fontSize: pxToRem(notificationsModal.muteLabelFontSize),
            lineHeight: notificationsModal.muteLabelLineHeight,
          }}
        >
          {t("server.modal.notifications.muteMobile")}
        </span>
        <button
          aria-checked={draft.muteMobile}
          aria-labelledby="channel-notifications-mobile-mute-label"
          className="relative flex-none border-0 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="channel-notifications-mobile-mute"
          onClick={onToggleMobileMute}
          role="switch"
          style={{
            background: draft.muteMobile ? "hsl(var(--primary))" : "hsl(var(--surface-tertiary))",
            borderRadius: pxToRem(999),
            height: pxToRem(notificationsModal.switchHeight),
            width: pxToRem(notificationsModal.switchWidth),
          }}
          type="button"
        >
          <span
            className="absolute rounded-full bg-[hsl(var(--primary-foreground))] transition-[left]"
            style={{
              height: pxToRem(notificationsModal.switchKnobSize),
              left: pxToRem(
                draft.muteMobile
                  ? notificationsModal.switchWidth -
                      notificationsModal.switchKnobSize -
                      notificationsModal.switchKnobTop
                  : notificationsModal.switchKnobTop,
              ),
              top: pxToRem(notificationsModal.switchKnobTop),
              width: pxToRem(notificationsModal.switchKnobSize),
            }}
          />
        </button>
      </div>

      <div className="flex items-center justify-end" style={serverModalPlainFooterStyle()}>
        <button
          className="border font-semibold transition hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="channel-notifications-cancel"
          onClick={onCancel}
          style={serverModalSecondaryButtonStyle()}
          type="button"
        >
          {t("common.cancel")}
        </button>
        <button
          aria-disabled={saveDisabled}
          className="border-0 font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="channel-notifications-save"
          disabled={saveDisabled}
          onClick={onSubmit}
          style={serverModalPrimaryButtonStyle(!saveDisabled)}
          type="button"
        >
          {t("common.save")}
        </button>
      </div>

      <span className="sr-only">{channelName}</span>
    </div>
  );
}

export type ChannelNotificationsModalProps = {
  readonly channelId: string;
  readonly channelName: string;
  readonly onClose: () => void;
  readonly open: boolean;
};

const FALLBACK_DRAFT: ChannelNotificationDraft = { level: "all", muteMobile: false };

export function ChannelNotificationsModal({
  channelId,
  channelName,
  onClose,
  open,
}: ChannelNotificationsModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ["workspace", "channel", channelId, "notification-settings"] as const;
  const settingsQuery = useQuery({
    enabled: open,
    queryFn: () => fetchChannelNotificationSettings(channelId),
    queryKey,
    staleTime: 30_000,
  });
  const initial = settingsQuery.data
    ? toChannelNotificationDraft(settingsQuery.data)
    : FALLBACK_DRAFT;
  /**
   * Taslak `null` başlar ve ilk dokunuşta doğar: `null` "kullanıcı henüz bir şey seçmedi,
   * uçtan geleni göster" demek. Kapanışta sıfırlanmasına gerek yok — pencere kapalıyken
   * hiç mount edilmiyor (`workspace-modals.tsx`), bir sonraki açılış yeni bir bileşen.
   */
  const [draft, setDraft] = useState<ChannelNotificationDraft | null>(null);
  const current = draft ?? initial;

  const saveMutation = useMutation({
    mutationFn: () =>
      updateChannelNotificationSettings(channelId, toChannelNotificationPayload(current)),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKey, settings);
      onClose();
    },
  });

  return (
    <ServerModalShell
      bodyPaddingBottom={0}
      closeLabel={t("common.close")}
      description={t("server.modal.notifications.description", { channel: channelName })}
      icon={<BellIcon />}
      onClose={onClose}
      open={open}
      title={t("server.modal.notifications.title")}
      tone="warning"
      width="notifications"
    >
      <ChannelNotificationsModalView
        channelName={channelName}
        draft={current}
        onCancel={onClose}
        onSelect={(level) => setDraft(selectChannelNotificationLevel(current, level))}
        onSubmit={() => saveMutation.mutate()}
        onToggleMobileMute={() => setDraft(toggleChannelNotificationMobileMute(current))}
        saveDisabled={
          saveMutation.isPending ||
          settingsQuery.isPending ||
          !hasChannelNotificationChange(initial, current)
        }
      />
    </ServerModalShell>
  );
}
