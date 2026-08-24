"use client";

import React, { memo, type ReactNode } from "react";
import type { ServerPublicProfileFriend } from "@wizards/types";

import { DiscoverPresenceDot } from "@/components/discover/discover-presence-dot";
import { useI18n } from "@/components/providers/locale-provider";
import { UserProfilePopover } from "@/components/shared/user-profile-popover";
import { Avatar } from "@/components/ui/avatar";
import { pxToRem } from "@/lib/discover/metrics";

export type ServerProfileMutualRowProps = {
  readonly currentUserId: string;
  readonly friend: ServerPublicProfileFriend;
  readonly renderProfilePopover?: (trigger: ReactNode) => ReactNode;
  readonly serverId: string;
};

function ServerProfileMutualRowComponent({
  currentUserId,
  friend,
  renderProfilePopover,
  serverId,
}: ServerProfileMutualRowProps) {
  const { t } = useI18n();
  const isAdmin = friend.role === "admin";
  const roleLabel = t(isAdmin ? "discover.profile.role.admin" : "discover.profile.role.member");
  const trigger = (
    <span
      className="flex w-full min-w-0 items-center text-left transition-colors hover:bg-[hsl(var(--surface-soft)/0.7)]"
      data-testid={`server-profile-mutual-${friend.id}`}
      style={{
        borderRadius: pxToRem(12),
        gap: pxToRem(10),
        padding: `${pxToRem(7)} ${pxToRem(8)}`,
      }}
    >
      <span
        className="relative shrink-0"
        data-testid="server-profile-mutual-avatar"
        style={{ height: pxToRem(28), width: pxToRem(28) }}
      >
        <Avatar
          alt={friend.displayName}
          fallback={friend.displayName}
          src={friend.avatarUrl}
          style={{ height: pxToRem(28), width: pxToRem(28) }}
        />
        <DiscoverPresenceDot
          className="absolute"
          presence={friend.presence}
          ringToken="surface-panel"
          ringWidth={2}
          size={9}
          style={{ bottom: pxToRem(-1), right: pxToRem(-1) }}
        />
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[hsl(var(--foreground))]"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: pxToRem(12.5),
          fontWeight: 500,
          lineHeight: 1.3,
        }}
      >
        {friend.displayName}
      </span>
      <span
        className="shrink-0"
        data-role={friend.role}
        style={{
          background: isAdmin ? "hsl(var(--primary)/0.16)" : "hsl(var(--surface-soft))",
          borderRadius: "999px",
          color: isAdmin ? "hsl(var(--primary))" : "hsl(var(--text-muted))",
          fontFamily: "var(--font-sans)",
          fontSize: pxToRem(10),
          fontWeight: 600,
          lineHeight: 1,
          padding: `${pxToRem(3)} ${pxToRem(8)}`,
        }}
      >
        {roleLabel}
      </span>
    </span>
  );

  if (renderProfilePopover) {
    return renderProfilePopover(trigger);
  }

  return (
    <UserProfilePopover
      currentUserId={currentUserId}
      serverId={serverId}
      testId={`server-profile-mutual-popover-${friend.id}`}
      userId={friend.id}
    >
      {trigger}
    </UserProfilePopover>
  );
}

export const ServerProfileMutualRow = memo(ServerProfileMutualRowComponent);
