"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquareMore, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/locale-provider";
import { fetchPendingFriends, friendsQueryKeys } from "@/lib/friends/client";

type FriendsSidebarProps = {
  onNavigate: (href: string) => void;
  onPrefetch?: ((href: string) => void) | undefined;
};

export function FriendsSidebar({ onNavigate, onPrefetch }: FriendsSidebarProps) {
  const { t } = useI18n();
  const pendingQuery = useQuery({
    queryFn: fetchPendingFriends,
    queryKey: friendsQueryKeys.pending,
    staleTime: 30_000,
  });

  const incomingCount = pendingQuery.data?.incoming.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <button
        aria-current="page"
        className="app-panel flex items-center justify-between rounded-[24px] border px-4 py-3 text-left transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        onClick={() => onNavigate("/channels/@me")}
        onMouseEnter={() => onPrefetch?.("/channels/@me")}
        type="button"
      >
        <span className="flex items-center gap-3">
          <span className="app-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl border">
            <Users className="h-4 w-4" />
          </span>
          <span className="text-app-foreground text-sm font-semibold">
            {t("friends.sidebar.friends")}
          </span>
        </span>
        {incomingCount > 0 ? <Badge>{incomingCount}</Badge> : null}
      </button>

      <div className="app-panel flex min-h-0 flex-1 flex-col rounded-[28px] border p-4">
        <div className="flex items-center gap-2">
          <MessageSquareMore className="text-app-muted h-4 w-4" />
          <p className="text-app-foreground text-xs font-semibold uppercase tracking-[0.2em]">
            {t("friends.sidebar.directMessages")}
          </p>
        </div>
        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center rounded-[24px] border border-dashed border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] px-4 py-6 text-center text-app-muted text-sm leading-6">
          {t("friends.sidebar.directMessagesPlaceholder")}
        </div>
      </div>
    </div>
  );
}
