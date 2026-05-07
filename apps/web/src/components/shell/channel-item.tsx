"use client";

import { Hash, MonitorUp, Pencil, Trash2, Volume2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";

type ChannelItemProps = {
  active: boolean;
  canManage: boolean;
  currentUserId?: string;
  name: string;
  mentionCount?: number;
  onDelete: () => void;
  onEdit: () => void;
  onPrefetch?: () => void;
  onSelect: () => void;
  testId?: string;
  type: "TEXT" | "VOICE";
  unreadCount?: number;
  voiceState?: VoiceChannelStateDTO | null;
};

export function ChannelItem({
  active,
  canManage,
  currentUserId,
  mentionCount = 0,
  name,
  onDelete,
  onEdit,
  onPrefetch,
  onSelect,
  testId,
  type,
  unreadCount = 0,
  voiceState = null,
}: ChannelItemProps) {
  const { t } = useI18n();
  const Icon = type === "VOICE" ? Volume2 : Hash;
  const previewParticipants = voiceState?.participants.slice(0, 3) ?? [];
  const participantCount = voiceState?.participants.length ?? 0;
  const visibleParticipantRows = voiceState?.participants.slice(0, 4) ?? [];
  const hiddenParticipantCount = Math.max(0, participantCount - visibleParticipantRows.length);

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div
        className={cn(
          "group relative flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-[20px] border px-1.5 py-1 transition sm:gap-1.5",
          active
            ? "border-[hsl(var(--primary)/0.28)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.18),hsl(var(--surface-card)/0.72))] text-[hsl(var(--foreground))] shadow-[0_14px_30px_hsl(var(--primary)/0.08)]"
            : "border-transparent text-app-muted hover:border-[hsl(var(--border)/0.56)] hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-[hsl(var(--foreground))]",
        )}
      >
        {active ? (
          <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[hsl(var(--primary))]" />
        ) : null}
        <button
          aria-current={active ? "page" : undefined}
          aria-label={t(
            type === "VOICE"
              ? "shell.channelItem.openVoiceChannel"
              : "shell.channelItem.openTextChannel",
            { name },
          )}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.6)]"
          onClick={onSelect}
          onFocus={onPrefetch}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSelect();
            }
          }}
          onMouseEnter={onPrefetch}
          data-testid={testId}
          type="button"
        >
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-xl border transition",
              active
                ? "border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
                : "border-[hsl(var(--border)/0.42)] bg-[hsl(var(--surface-card)/0.38)] text-app-soft group-hover:text-app-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em]">{name}</span>
          {type === "TEXT" && unreadCount > 0 ? (
            <span
              className={cn(
                "ml-auto inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border px-1.5 text-[11px] font-black shadow-[0_10px_22px_hsl(var(--primary)/0.12)]",
                mentionCount > 0
                  ? "border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.14)] text-[hsl(var(--danger))]"
                  : "border-[hsl(var(--primary)/0.26)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]",
              )}
              title={t(
                mentionCount > 0
                  ? "shell.channelItem.mentionCount"
                  : "shell.channelItem.unreadCount",
                { count: mentionCount > 0 ? mentionCount : unreadCount },
              )}
            >
              {mentionCount > 0 ? `@${mentionCount}` : unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
          {type === "VOICE" ? (
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <span className="rounded-full border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-card)/0.42)] px-2 py-0.5 text-[11px] font-semibold text-app-soft">
                {participantCount}/10
              </span>
              {previewParticipants.length > 0 ? (
                <div className="hidden items-center -space-x-2 min-[390px]:flex">
                  {previewParticipants.map((participant) => (
                    <Avatar
                      alt={participant.displayName ?? participant.username}
                      className="h-5 w-5 border-2 border-[hsl(var(--surface-card))] text-[9px]"
                      fallback={participant.displayName ?? participant.username}
                      key={participant.userId}
                      src={participant.avatarUrl}
                    />
                  ))}
                  {participantCount > previewParticipants.length ? (
                    <span className="ml-1 text-[11px] font-semibold text-app-soft">
                      +{participantCount - previewParticipants.length}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </button>

        {canManage ? (
          <div className="hidden items-center gap-1 opacity-0 transition group-hover:opacity-100 sm:flex">
            <button
              aria-label={t("shell.channelItem.edit", { name })}
              className="text-app-muted rounded-xl p-1.5 transition hover:bg-[hsl(var(--surface-soft)/0.74)] hover:text-[hsl(var(--foreground))]"
              onClick={onEdit}
              type="button"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={t("shell.channelItem.delete", { name })}
              className="text-app-muted rounded-xl p-1.5 transition hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger))]"
              onClick={onDelete}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {type === "VOICE" && visibleParticipantRows.length > 0 ? (
        <div className="mt-1.5 space-y-1.5 pl-8 sm:pl-10">
          {visibleParticipantRows.map((participant) => {
            const participantLabel = participant.displayName ?? participant.username;
            const isCurrentUser = participant.userId === currentUserId;

            return (
              <div
                className="app-panel-soft flex min-h-9 items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-xs text-app-muted"
                data-testid={`voice-sidebar-participant-${participant.username}`}
                data-user-id={participant.userId}
                key={participant.userId}
              >
                <Avatar
                  alt={participantLabel}
                  className="h-5 w-5 border border-[hsl(var(--border)/0.72)] text-[9px]"
                  fallback={participantLabel}
                  src={participant.avatarUrl}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-app-foreground">
                  {participantLabel}
                </span>
                {isCurrentUser ? (
                  <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--primary))]">
                    {t("voice.sidebar.you")}
                  </span>
                ) : null}
                {participant.isScreenSharing ? (
                  <span
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--success))]"
                    data-testid={`voice-sidebar-screen-share-${participant.username}`}
                    title={t("voice.sidebar.screenSharing")}
                  >
                    <MonitorUp className="h-3 w-3" />
                    <span className="sr-only">{t("voice.sidebar.screenSharing")}</span>
                  </span>
                ) : null}
              </div>
            );
          })}

          {hiddenParticipantCount > 0 ? (
            <div className="pl-1 text-[11px] font-medium text-app-soft">
              {t("voice.sidebar.moreParticipants", { count: hiddenParticipantCount })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
