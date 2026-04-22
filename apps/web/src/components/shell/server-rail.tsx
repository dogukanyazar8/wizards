"use client";

import { motion } from "framer-motion";
import { MessageCircleMore, Plus } from "lucide-react";
import type { WorkspaceServerSummary } from "@wizards/types";
import { getServerHref } from "@/lib/workspace/client";
import { ServerRailSkeleton } from "@/components/shell/shell-skeletons";
import { ServerIcon } from "@/components/shell/server-icon";

type ServerRailProps = {
  activeServerId: string | null;
  loading: boolean;
  onNavigate: (href: string) => void;
  onOpenCreateServer: () => void;
  onOpenServerContextMenu: (serverId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  servers: WorkspaceServerSummary[];
};

export function ServerRail({
  activeServerId,
  loading,
  onNavigate,
  onOpenCreateServer,
  onOpenServerContextMenu,
  servers,
}: ServerRailProps) {
  if (loading) {
    return (
      <aside className="app-rail hidden h-full w-[var(--server-rail-width)] shrink-0 md:block">
        <ServerRailSkeleton />
      </aside>
    );
  }

  return (
    <aside className="app-rail flex h-full w-[var(--server-rail-width)] shrink-0 flex-col items-center py-3">
      <ServerIcon
        active={!activeServerId}
        fallback="DM"
        label="Direct messages"
        onClick={() => onNavigate("/channels/@me")}
      />

      <div className="my-3 h-px w-8 rounded-full bg-[hsl(var(--border)/0.72)]" />

      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto px-2">
        {servers.map((server) => (
          <ServerIcon
            active={server.id === activeServerId}
            fallback={server.name}
            iconUrl={server.iconUrl}
            key={server.id}
            label={server.name}
            onClick={() => onNavigate(getServerHref(server))}
            onContextMenu={(event) => onOpenServerContextMenu(server.id, event)}
          />
        ))}
      </div>

      <motion.button
        aria-label="Create server"
        className="group relative mt-3 flex h-12 w-12 items-center justify-center rounded-[22px] border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 outline-none transition hover:rounded-[18px] hover:bg-emerald-500/20 focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        onClick={onOpenCreateServer}
        title="Create a server"
        type="button"
        whileHover={{ scale: 1.06, y: -1 }}
        whileTap={{ scale: 0.97 }}
      >
        <Plus className="h-5 w-5" />
        <span className="app-tooltip pointer-events-none absolute left-full ml-3 rounded-xl border px-2.5 py-1 text-xs opacity-0 shadow-lg shadow-black/10 transition group-hover:opacity-100">
          Add Server
        </span>
      </motion.button>
    </aside>
  );
}

export function MobileDrawerTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="Open workspace navigation"
      className="app-panel-soft text-app-foreground inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition hover:opacity-90 md:hidden"
      onClick={onClick}
      type="button"
    >
      <MessageCircleMore className="h-4 w-4" />
    </button>
  );
}
