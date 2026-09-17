"use client";

import React from "react";
import { Eye, Hash, Lock, MicOff, Volume2 } from "lucide-react";

import { screenShareGameLabel } from "@/lib/voice/screen-share-label";
import { useVoiceStore } from "@/store/voice-store";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import { SERVER_METRICS, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { cn } from "@/lib/utils";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";

/**
 * Kanal satırı ve altındaki ses katılımcıları — SPEC-SUNUCU §2.4.
 *
 * Ölçünün tamamı `SERVER_METRICS.sidebar`'dan gelir; satır artık kendi `px`'ini yazmıyor.
 * Referansın satırında **yönetici eylemi yok**: kalem/çöp kaplaması kaldırıldı, düzenleme ve
 * silme satırın sağ tık menüsüne taşındı (`channel-sidebar.tsx`). Sürükleme tutamağı da yok;
 * satırın kendisi sürükleniyor (`dragHandleProps`).
 *
 * SPEC'te olmayan ama üründe **gerçek** olduğu için korunan iki şey raporda sapma olarak
 * kayıtlı:
 *
 * 1. **Salt-okunur göstergesi** (`Eye`, 12) kilit ikonunun ölçüsünü paylaşır. SPEC satırı
 *    yalnız kilit/okunmamış/sayaç çiziyor ama "yazamazsın" bilgisini üründe başka hiçbir
 *    yüzey taşımıyor.
 * 2. **Katılımcı listesi her ses kanalının altında**, yalnız bağlı olunanın değil. Referans
 *    tek kanalı doldurur çünkü tek ekran durumu gösteriyor; ürün bunu zaten canlı veriyle
 *    çiziyor ve `voice.spec.ts` buna bağlı.
 *
 * `isSpeaking` / `isMuted` yalnız **bağlı olunan** kanal için gerçektir: sunucu genelindeki
 * `VoiceChannelStateDTO` konuşma ve mikrofon durumu taşımaz, LiveKit odası taşır. Bu yüzden
 * iki küme dışarıdan geçirilir; geçmediğinde satır `isDeafened`'a düşer (sağır olan aynı
 * zamanda susturulmuştur) ve konuşma halkası çizilmez.
 */

type ChannelItemProps = {
  active: boolean;
  canAccess?: boolean;
  currentUserId?: string;
  /**
   * dnd-kit'in `attributes` + `listeners` demeti. Referansta ayrı bir tutamak **yok**:
   * satırın kendisi sürükleniyor. `PointerSensor` 4 px eşiğinde olduğu için tıklama ile
   * sürükleme birbirine karışmaz.
   */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  name: string;
  mentionCount?: number;
  /** Bağlı odadan gelen susturulmuş kullanıcılar; yoksa `isDeafened`'a düşülür. */
  mutedUserIds?: ReadonlySet<string>;
  onPrefetch?: () => void;
  readOnly?: boolean;
  onSelect: () => void;
  /** Bağlı odadan gelen konuşanlar; ekran okuyucu için ayrıca metin yazılır (00 §8). */
  speakingUserIds?: ReadonlySet<string>;
  testId?: string;
  type: "TEXT" | "VOICE";
  unreadCount?: number;
  voiceState?: VoiceChannelStateDTO | null;
};

const MAX_PARTICIPANT_ROWS = 4;

export function ChannelItem({
  active,
  canAccess = true,
  currentUserId,
  dragHandleProps,
  mentionCount = 0,
  mutedUserIds,
  name,
  onPrefetch,
  readOnly = false,
  onSelect,
  speakingUserIds,
  testId,
  type,
  unreadCount = 0,
  voiceState = null,
}: ChannelItemProps) {
  const { t } = useI18n();
  const viewerCounts = useVoiceStore((state) => state.screenShareViewerCounts);
  const { sidebar } = SERVER_METRICS;
  const Icon = type === "VOICE" ? Volume2 : Hash;
  const isLocked = !canAccess;
  const isReadOnly = !isLocked && type === "TEXT" && readOnly;
  const isUnread = !isLocked && type === "TEXT" && unreadCount > 0;
  const participants = isLocked ? [] : (voiceState?.participants ?? []);
  const participantCount = participants.length;
  const visibleParticipantRows = participants.slice(0, MAX_PARTICIPANT_ROWS);
  const hiddenParticipantCount = Math.max(0, participantCount - visibleParticipantRows.length);
  const badgeCount = mentionCount > 0 ? mentionCount : unreadCount;

  return (
    <div className="min-w-0 max-w-full">
      <div className="relative min-w-0 max-w-full">
        {active && !isLocked ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 -translate-y-1/2"
            style={{
              background: "hsl(var(--primary))",
              borderRadius: `0 ${pxToRem(sidebar.channelActiveStripeRadius)} ${pxToRem(
                sidebar.channelActiveStripeRadius,
              )} 0`,
              height: pxToRem(sidebar.channelActiveStripeHeight),
              left: pxToRem(sidebar.channelActiveStripeLeft),
              width: pxToRem(sidebar.channelActiveStripeWidth),
            }}
          />
        ) : null}

        <button
          aria-current={active && !isLocked ? "page" : undefined}
          aria-label={t(
            isLocked
              ? "shell.channelItem.locked"
              : type === "VOICE"
                ? "shell.channelItem.openVoiceChannel"
                : "shell.channelItem.openTextChannel",
            { name },
          )}
          className={cn(
            "flex w-full min-w-0 items-center text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.6)]",
            active ? "" : "hover:bg-[hsl(var(--surface-soft))]",
            isLocked && "cursor-not-allowed",
          )}
          data-testid={testId}
          disabled={isLocked}
          onClick={isLocked ? undefined : onSelect}
          onFocus={isLocked ? undefined : onPrefetch}
          onMouseEnter={isLocked ? undefined : onPrefetch}
          style={{
            background: active
              ? `hsl(var(--primary) / ${sidebar.channelActiveBackgroundAlpha})`
              : "transparent",
            borderRadius: pxToRem(sidebar.channelRowRadius),
            gap: pxToRem(sidebar.channelRowGap),
            padding: `${pxToRem(sidebar.channelRowPaddingY)} ${pxToRem(
              sidebar.channelRowPaddingX,
            )}`,
          }}
          type="button"
          {...dragHandleProps}
        >
          <span
            className="grid flex-none place-items-center"
            style={{
              color: active ? "hsl(var(--primary))" : "hsl(var(--text-muted))",
              height: pxToRem(sidebar.channelIconSize),
              width: pxToRem(sidebar.channelIconSize),
            }}
          >
            <Icon
              aria-hidden="true"
              style={{
                height: pxToEm(sidebar.channelIconSize, sidebar.channelNameFontSize),
                width: pxToEm(sidebar.channelIconSize, sidebar.channelNameFontSize),
              }}
            />
          </span>

          <span
            className="min-w-0 flex-1 truncate"
            style={{
              color: active || isUnread ? "hsl(var(--foreground))" : "hsl(var(--text-secondary))",
              fontSize: pxToRem(sidebar.channelNameFontSize),
              fontWeight:
                active || isUnread
                  ? sidebar.channelNameWeightActive
                  : sidebar.channelNameWeightRead,
              lineHeight: sidebar.channelNameLineHeight,
            }}
          >
            {name}
          </span>

          {isReadOnly ? (
            <Eye
              aria-label={t("shell.channelItem.readOnly", { name })}
              role="img"
              style={{
                color: "hsl(var(--text-muted))",
                flex: "none",
                height: pxToRem(sidebar.channelLockIconSize),
                width: pxToRem(sidebar.channelLockIconSize),
              }}
            />
          ) : null}

          {isLocked ? (
            <Lock
              aria-label={t("shell.channelItem.lockedBadge")}
              role="img"
              style={{
                color: "hsl(var(--text-muted))",
                flex: "none",
                height: pxToRem(sidebar.channelLockIconSize),
                width: pxToRem(sidebar.channelLockIconSize),
              }}
            />
          ) : null}

          {isUnread ? (
            <span
              aria-label={t(
                mentionCount > 0
                  ? "shell.channelItem.mentionCount"
                  : "shell.channelItem.unreadCount",
                { count: badgeCount },
              )}
              className="grid flex-none place-items-center"
              role="status"
              style={{
                background: "hsl(var(--danger))",
                borderRadius: pxToRem(sidebar.channelUnreadRadius),
                color: "hsl(var(--danger-foreground))",
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(sidebar.channelUnreadFontSize),
                fontWeight: 600,
                height: pxToRem(sidebar.channelUnreadHeight),
                lineHeight: 1,
                minWidth: pxToRem(sidebar.channelUnreadMinWidth),
                padding: `0 ${pxToRem(sidebar.channelUnreadPaddingX)}`,
              }}
            >
              {mentionCount > 0 ? `@${mentionCount}` : badgeCount > 99 ? "99+" : badgeCount}
            </span>
          ) : null}

          {type === "VOICE" && participantCount > 0 ? (
            <span
              aria-label={t("voice.sidebar.participantCount", { count: participantCount })}
              className="flex flex-none items-center"
              role="status"
              style={{
                color: "hsl(var(--success))",
                fontFamily: DISPLAY_FONT,
                fontSize: pxToRem(sidebar.channelVoiceCountFontSize),
                fontWeight: 600,
                gap: pxToRem(sidebar.channelVoiceCountGap),
                lineHeight: 1,
              }}
            >
              <Volume2
                aria-hidden="true"
                style={{
                  height: pxToRem(sidebar.channelVoiceCountIconSize),
                  width: pxToRem(sidebar.channelVoiceCountIconSize),
                }}
              />
              {participantCount}
            </span>
          ) : null}
        </button>
      </div>

      {type === "VOICE" && visibleParticipantRows.length > 0 ? (
        <div>
          {visibleParticipantRows.map((participant) => {
            const participantLabel = participant.displayName ?? participant.username;
            const isSpeaking = speakingUserIds?.has(participant.userId) ?? false;
            const isMuted =
              mutedUserIds?.has(participant.userId) ?? Boolean(participant.isDeafened);
            const isCurrentUser = participant.userId === currentUserId;

            return (
              <div
                className="flex items-center transition-colors hover:bg-[hsl(var(--surface-soft)/0.6)]"
                data-testid={`voice-sidebar-participant-${participant.username}`}
                data-user-id={participant.userId}
                key={participant.userId}
                style={{
                  borderRadius: pxToRem(sidebar.participantRadius),
                  gap: pxToRem(sidebar.participantGap),
                  padding: `${pxToRem(sidebar.participantPaddingY)} ${pxToRem(
                    sidebar.participantPaddingRight,
                  )} ${pxToRem(sidebar.participantPaddingY)} ${pxToRem(
                    sidebar.participantPaddingLeft,
                  )}`,
                }}
              >
                <Avatar
                  alt={participantLabel}
                  className="border-0"
                  fallback={participantLabel}
                  src={participant.avatarUrl}
                  style={{
                    boxShadow: isSpeaking
                      ? `0 0 0 ${pxToRem(sidebar.participantSpeakingRingWidth)} hsl(var(--success))`
                      : undefined,
                    fontFamily: DISPLAY_FONT,
                    fontSize: pxToRem(sidebar.participantAvatarFontSize),
                    height: pxToRem(sidebar.participantAvatarSize),
                    width: pxToRem(sidebar.participantAvatarSize),
                  }}
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  style={{
                    color: isCurrentUser
                      ? "hsl(var(--primary))"
                      : isSpeaking
                        ? "hsl(var(--foreground))"
                        : "hsl(var(--text-secondary))",
                    fontSize: pxToRem(sidebar.participantNameFontSize),
                    fontWeight: 500,
                    lineHeight: 1,
                  }}
                >
                  {participantLabel}
                </span>
                {isSpeaking ? (
                  <span className="sr-only">
                    {t("voice.sidebar.speaking", { name: participantLabel })}
                  </span>
                ) : null}
                {isMuted ? (
                  <MicOff
                    aria-label={t("voice.sidebar.muted", { name: participantLabel })}
                    role="img"
                    style={{
                      color: "hsl(var(--danger))",
                      flex: "none",
                      height: pxToRem(sidebar.participantMutedIconSize),
                      width: pxToRem(sidebar.participantMutedIconSize),
                    }}
                  />
                ) : null}
                {participant.isScreenSharing ? (
                  <span
                    className="flex flex-none items-center"
                    data-testid={`voice-sidebar-screen-share-${participant.username}`}
                    style={{
                      background: "hsl(var(--primary) / 0.16)",
                      borderRadius: pxToRem(sidebar.participantLiveChipRadius),
                      color: "hsl(var(--primary))",
                      fontFamily: DISPLAY_FONT,
                      fontSize: pxToRem(sidebar.participantLiveChipFontSize),
                      fontWeight: 600,
                      lineHeight: 1,
                      padding: `${pxToRem(sidebar.participantLiveChipPaddingY)} ${pxToRem(
                        sidebar.participantLiveChipPaddingX,
                      )}`,
                    }}
                    title={t("voice.sidebar.screenSharing")}
                  >
                    {screenShareGameLabel(participant.stream)
                      ? t("voice.sidebar.streamingGame", {
                          game: screenShareGameLabel(participant.stream)!,
                        })
                      : t("voice.sidebar.liveChip")}{" "}
                    <span data-testid={`voice-sidebar-screen-share-count-${participant.username}`}>
                      {viewerCounts[participant.userId] ?? participant.screenShareViewerCount ?? 0}
                    </span>
                  </span>
                ) : null}
              </div>
            );
          })}

          {hiddenParticipantCount > 0 ? (
            <div
              style={{
                color: "hsl(var(--text-muted))",
                fontSize: pxToRem(sidebar.participantNameFontSize),
                fontWeight: 500,
                padding: `${pxToRem(sidebar.participantPaddingY)} ${pxToRem(
                  sidebar.participantPaddingRight,
                )} ${pxToRem(sidebar.participantPaddingY)} ${pxToRem(
                  sidebar.participantPaddingLeft,
                )}`,
              }}
            >
              {t("voice.sidebar.moreParticipants", { count: hiddenParticipantCount })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
