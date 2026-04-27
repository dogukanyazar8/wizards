"use client";

import { Hash, Pencil, Trash2, Volume2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";

type ChannelItemProps = {
  active: boolean;
  canManage: boolean;
  name: string;
  onDelete: () => void;
  onEdit: () => void;
  onPrefetch?: () => void;
  onSelect: () => void;
  type: "TEXT" | "VOICE";
  voiceState?: VoiceChannelStateDTO | null;
};

export function ChannelItem({
  active,
  canManage,
  name,
  onDelete,
  onEdit,
  onPrefetch,
  onSelect,
  type,
  voiceState = null,
}: ChannelItemProps) {
  const { t } = useI18n();
  const Icon = type === "VOICE" ? Volume2 : Hash;
  const previewParticipants = voiceState?.participants.slice(0, 3) ?? [];
  const participantCount = voiceState?.participants.length ?? 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-2xl px-2 py-1.5 transition",
          active
            ? "bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--foreground))]"
            : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-[hsl(var(--foreground))]",
        )}
      >
        <button
          aria-current={active ? "page" : undefined}
          aria-label={t(
            type === "VOICE"
              ? "shell.channelItem.openVoiceChannel"
              : "shell.channelItem.openTextChannel",
            { name },
          )}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.6)]"
          onClick={onSelect}
          onFocus={onPrefetch}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSelect();
            }
          }}
          onMouseEnter={onPrefetch}
          type="button"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">{name}</span>
          {type === "VOICE" ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-semibold text-app-soft">
                {participantCount}/10
              </span>
              {previewParticipants.length > 0 ? (
                <div className="flex items-center -space-x-2">
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
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              aria-label={t("shell.channelItem.edit", { name })}
              className="text-app-muted rounded-lg p-1.5 transition hover:bg-[hsl(var(--surface-soft)/0.74)] hover:text-[hsl(var(--foreground))]"
              onClick={onEdit}
              type="button"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={t("shell.channelItem.delete", { name })}
              className="text-app-muted rounded-lg p-1.5 transition hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger-foreground))]"
              onClick={onDelete}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
