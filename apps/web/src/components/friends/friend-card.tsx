"use client";

import { MoreVertical } from "lucide-react";
import { useState } from "react";
import type { FriendDto } from "@/lib/friends/types";
import { Avatar } from "@/components/ui/avatar";
import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";
import { useI18n } from "@/components/providers/locale-provider";

type FriendCardProps = {
  friend: FriendDto;
  onBlock: (friend: FriendDto) => void;
  onMessage: (friend: FriendDto) => void;
  onRemove: (friend: FriendDto) => void;
};

function getStatusDotClass(status: FriendDto["status"]) {
  if (status === "ONLINE") {
    return "bg-[hsl(var(--success))]";
  }

  if (status === "IDLE") {
    return "bg-[hsl(42_96%_56%)]";
  }

  if (status === "DND") {
    return "bg-[hsl(var(--danger))]";
  }

  return "bg-[hsl(var(--text-soft))]";
}

function getStatusKey(status: FriendDto["status"]) {
  if (status === "ONLINE") {
    return "friends.status.online";
  }

  if (status === "IDLE") {
    return "friends.status.idle";
  }

  if (status === "DND") {
    return "friends.status.dnd";
  }

  return "friends.status.offline";
}

export function FriendCard({ friend, onBlock, onMessage, onRemove }: FriendCardProps) {
  const { t } = useI18n();
  const [menuState, setMenuState] = useState({
    open: false,
    x: 0,
    y: 0,
  });
  const displayName = friend.displayName ?? friend.username;

  return (
    <div className="app-panel flex items-center justify-between gap-4 rounded-[28px] border p-4 transition focus-within:ring-2 focus-within:ring-[hsl(var(--ring)/0.45)] hover:opacity-95">
      <div className="flex min-w-0 items-center gap-4">
        <div className="relative">
          <Avatar
            alt={displayName}
            className="h-12 w-12 text-sm"
            fallback={displayName}
            src={friend.avatarUrl}
          />
          <span
            aria-hidden="true"
            className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--surface-card))] ${getStatusDotClass(friend.status)}`}
          />
        </div>
        <div className="min-w-0">
          <p className="text-app-foreground truncate text-sm font-semibold">{displayName}</p>
          <p className="text-app-muted truncate text-sm">@{friend.username}</p>
          <p className="mt-1 truncate text-xs text-app-soft">
            {friend.customStatus ?? t(getStatusKey(friend.status))}
          </p>
        </div>
      </div>

      <button
        aria-label={t("friends.actions.openMenu", { name: displayName })}
        className="app-panel-soft text-app-muted rounded-2xl border p-2 transition hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuState({
            open: true,
            x: rect.left,
            y: rect.bottom + 8,
          });
        }}
        type="button"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      <ContextMenu
        onClose={() => setMenuState((state) => ({ ...state, open: false }))}
        open={menuState.open}
        position={menuState}
      >
        <ContextMenuItem
          onClick={() => {
            setMenuState((state) => ({ ...state, open: false }));
            onMessage(friend);
          }}
        >
          {t("friends.actions.message")}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            setMenuState((state) => ({ ...state, open: false }));
            onRemove(friend);
          }}
        >
          {t("friends.actions.remove")}
        </ContextMenuItem>
        <ContextMenuItem
          destructive
          onClick={() => {
            setMenuState((state) => ({ ...state, open: false }));
            onBlock(friend);
          }}
        >
          {t("friends.actions.block")}
        </ContextMenuItem>
      </ContextMenu>
    </div>
  );
}
