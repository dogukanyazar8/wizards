"use client";

import { motion } from "framer-motion";
import { MessageCircleMore, Plus } from "lucide-react";
import type { WorkspaceServerSummary } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { getServerHref } from "@/lib/workspace/client";
import { ServerRailSkeleton } from "@/components/shell/shell-skeletons";
import { ServerIcon } from "@/components/shell/server-icon";

type ServerRailProps = {
  activeServerId: string | null;
  loading: boolean;
  onNavigate: (href: string) => void;
  onOpenCreateServer: () => void;
  onOpenServerContextMenu: (serverId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onPrefetch?: (href: string) => void;
  servers: WorkspaceServerSummary[];
};

export function ServerRail({
  activeServerId,
  loading,
  onNavigate,
  onOpenCreateServer,
  onOpenServerContextMenu,
  onPrefetch,
  servers,
}: ServerRailProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <aside className="app-rail hidden h-full w-[var(--server-rail-width)] shrink-0 md:block">
        <ServerRailSkeleton />
      </aside>
    );
  }

  return (
    <aside className="app-rail flex h-full w-[var(--server-rail-width)] shrink-0 flex-col items-center gap-3 px-2 pb-3 pt-4">
      {/* DM */}
      <div className="w-full shrink-0 rounded-[26px] border border-[hsl(var(--border)/0.38)] bg-[hsl(var(--surface-soft)/0.18)] px-2 py-2">
        <div className="flex justify-center">
          <ServerIcon
            active={!activeServerId}
            fallback="DM"
            label={t("shell.serverRail.directMessages")}
            onClick={() => onNavigate("/channels/@me")}
            {...(onPrefetch ? { onPrefetch: () => onPrefetch("/channels/@me") } : {})}
          />
        </div>
      </div>

      {/* Servers */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto rounded-[26px] border border-[hsl(var(--border)/0.38)] bg-[hsl(var(--surface-soft)/0.18)] px-2 py-3">
        {servers.map((server) => (
          <ServerIcon
            active={server.id === activeServerId}
            fallback={server.name}
            iconUrl={server.iconUrl}
            key={server.id}
            label={server.name}
            onClick={() => onNavigate(getServerHref(server))}
            onContextMenu={(event) => onOpenServerContextMenu(server.id, event)}
            {...(onPrefetch ? { onPrefetch: () => onPrefetch(getServerHref(server)) } : {})}
          />
        ))}
      </div>

      {/* Add server */}
      <motion.button
        aria-label={t("shell.serverRail.createServer")}
        className="group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] border border-[hsl(var(--success)/0.22)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] outline-none transition hover:rounded-[18px] hover:bg-[hsl(var(--success)/0.2)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--success)/0.55)]"
        onClick={onOpenCreateServer}
        title={t("shell.serverRail.createServer")}
        type="button"
        whileHover={{ scale: 1.06, y: -1 }}
        whileTap={{ scale: 0.97 }}
      >
        <Plus className="h-5 w-5" />
        <span className="app-tooltip pointer-events-none absolute left-full ml-3 rounded-xl border px-2.5 py-1 text-xs opacity-0 shadow-[0_12px_26px_hsl(var(--shadow-color)/0.12)] transition group-hover:opacity-100">
          {t("shell.serverRail.addServer")}
        </span>
      </motion.button>
    </aside>
  );
}

export function MobileDrawerTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();

  return (
    <button
      aria-label={t("shell.mobile.openWorkspaceNavigation")}
      className="app-panel-soft text-app-foreground inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition hover:opacity-90 md:hidden"
      onClick={onClick}
      type="button"
    >
      <MessageCircleMore className="h-4 w-4" />
    </button>
  );
}
