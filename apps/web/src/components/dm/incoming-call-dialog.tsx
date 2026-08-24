"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { useDMCallStore } from "@/store/dm-call-store";

function getRemainingSeconds(expiresAt: number | null) {
  if (expiresAt === null) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

/** App-wide ring UI for an inbound DM call. Rendered by DMCallProvider. */
export function IncomingDMCallDialog({
  onAccept,
  onDecline,
}: {
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const session = useDMCallStore((state) => state.session);
  const isRingingIn = session?.status === "ringing-in";
  // A tick counter keeps the countdown live without storing a derived value in state.
  const [, setTick] = useState(0);
  const remainingSeconds = getRemainingSeconds(session?.ringExpiresAt ?? null);

  useEffect(() => {
    if (!isRingingIn) {
      return;
    }

    const timer = window.setInterval(() => setTick((current) => current + 1), 1_000);

    return () => window.clearInterval(timer);
  }, [isRingingIn]);

  const peerName = session?.peer?.displayName ?? session?.peer?.username ?? "";

  return (
    <Modal
      description={t("dm.call.autoDecline", { seconds: remainingSeconds })}
      onClose={() => void onDecline()}
      open={Boolean(isRingingIn)}
      title={session?.isVideo ? t("dm.call.incomingVideo") : t("dm.call.incomingVoice")}
    >
      {isRingingIn && session ? (
        <div className="space-y-5" data-testid="dm-incoming-call">
          <div className="app-panel-soft flex items-center gap-3 rounded-[1.375rem] border p-4">
            <Avatar
              alt={peerName}
              className="h-12 w-12 border-none text-sm"
              fallback={peerName}
              src={session.peer?.avatarUrl ?? null}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-foreground">{peerName}</p>
              <p className="flex items-center gap-1.5 text-xs text-app-muted">
                {session.isVideo ? (
                  <Video className="h-3.5 w-3.5" />
                ) : (
                  <Phone className="h-3.5 w-3.5" />
                )}
                {session.isVideo ? t("dm.call.incomingVideo") : t("dm.call.incomingVoice")}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.1)] px-4 py-2 text-sm font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.14)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="dm-call-decline"
              onClick={() => void onDecline()}
              type="button"
            >
              <PhoneOff className="h-4 w-4" />
              {t("dm.call.decline")}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--success)/0.32)] bg-[hsl(var(--success)/0.14)] px-4 py-2 text-sm font-semibold text-[hsl(var(--success))] transition hover:bg-[hsl(var(--success)/0.18)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid="dm-call-accept"
              onClick={() => void onAccept()}
              type="button"
            >
              <Phone className="h-4 w-4" />
              {t("dm.call.accept")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
