"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, Phone, PhoneOff, Video } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { useDMCallStore } from "@/store/dm-call-store";

/**
 * Persistent bar for a minimized DM call, so the call survives navigating away from the
 * conversation. Mirrors the channel-voice reminder bar.
 */
export function DmCallBar({ onLeave }: { onLeave: () => void | Promise<void> }) {
  const { t } = useI18n();
  const router = useRouter();
  const session = useDMCallStore((state) => state.session);
  const isMinimized = useDMCallStore((state) => state.isMinimized);
  const setMinimized = useDMCallStore((state) => state.setMinimized);

  if (!session || !isMinimized) {
    return null;
  }

  const peerName = session.peer?.displayName ?? session.peer?.username ?? "";

  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-[24px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.94)] px-4 py-2.5 shadow-[0_24px_70px_hsl(var(--shadow-color)/0.16)] backdrop-blur-xl"
      data-testid="dm-call-bar"
    >
      {session.isVideo ? (
        <Video className="h-4 w-4 text-[hsl(var(--success))]" />
      ) : (
        <Phone className="h-4 w-4 text-[hsl(var(--success))]" />
      )}
      <p className="min-w-0 truncate text-sm font-semibold text-app-foreground">
        {session.isVideo
          ? t("dm.call.videoWith", { name: peerName })
          : t("dm.call.voiceWith", { name: peerName })}
      </p>
      <button
        aria-label={t("dm.call.expand")}
        className="inline-flex items-center gap-1.5 rounded-2xl border border-[hsl(var(--border)/0.64)] px-3 py-1.5 text-xs font-semibold text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="dm-call-expand"
        onClick={() => {
          setMinimized(false);
          router.push(`/channels/@me/${session.conversationId}`);
        }}
        type="button"
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
        {t("dm.call.expand")}
      </button>
      <button
        aria-label={t("dm.call.leave")}
        className="inline-flex items-center gap-1.5 rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.1)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="dm-call-bar-leave"
        onClick={() => void onLeave()}
        type="button"
      >
        <PhoneOff className="h-3.5 w-3.5" />
        {t("dm.call.leave")}
      </button>
    </div>
  );
}
