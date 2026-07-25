"use client";

import { MoreVertical } from "lucide-react";
import { useState } from "react";
import type { FriendDto } from "@/lib/friends/types";
import { UserProfilePopover } from "@/components/shared/user-profile-popover";
import { Avatar } from "@/components/ui/avatar";
import { ContextMenu, ContextMenuItem } from "@/components/ui/context-menu";
import { useI18n } from "@/components/providers/locale-provider";

type FriendCardProps = {
  currentUserId: string;
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

export function FriendCard({
  currentUserId,
  friend,
  onBlock,
  onMessage,
  onRemove,
}: FriendCardProps) {
  const { t } = useI18n();
  const [menuState, setMenuState] = useState({
    open: false,
    x: 0,
    y: 0,
  });
  const displayName = friend.displayName ?? friend.username;
  const openMessage = () => onMessage(friend);

  return (
    <div
      aria-label={t("friends.actions.message")}
      className="app-panel group flex cursor-pointer items-center justify-between gap-3 rounded-[24px] border p-3 transition focus-within:ring-2 focus-within:ring-[hsl(var(--ring)/0.45)] hover:-translate-y-0.5 hover:shadow-[0_18px_42px_hsl(var(--shadow-color)/0.1)] sm:gap-4 sm:rounded-[28px] sm:p-4"
      data-testid={`friend-card-${friend.username}`}
      onClick={openMessage}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openMessage();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <div
          className="relative shrink-0"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <UserProfilePopover currentUserId={currentUserId} userId={friend.id}>
            <Avatar
              alt={displayName}
              className="h-11 w-11 text-sm sm:h-12 sm:w-12"
              fallback={displayName}
              src={friend.avatarUrl}
            />
          </UserProfilePopover>
          <span
            aria-hidden="true"
            className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--surface-card))] ${getStatusDotClass(friend.status)}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-app-foreground truncate text-sm font-semibold">{displayName}</p>
          <p className="text-app-muted truncate text-sm">@{friend.username}</p>
          <p className="mt-1 truncate text-xs text-app-soft">
            {friend.customStatus ?? t(getStatusKey(friend.status))}
          </p>
        </div>
      </div>

      <button
        aria-label={t("friends.actions.openMenu", { name: displayName })}
        className="app-panel-soft text-app-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuState({
            open: true,
            x: rect.left,
            y: rect.bottom + 8,
          });
        }}
        onKeyDown={(event) => event.stopPropagation()}
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
