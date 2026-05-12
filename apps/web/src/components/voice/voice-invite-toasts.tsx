"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, PhoneCall, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { getSocket } from "@/lib/socket/client";
import type { VoiceInviteErrorPayload, VoiceInvitePayload } from "@/lib/socket/events";
import { cn } from "@/lib/utils";

type VoiceInviteEntry = VoiceInvitePayload & {
  accepting?: boolean | undefined;
  errorMessage?: string | undefined;
};

function getInviteErrorMessage(
  t: ReturnType<typeof useI18n>["t"],
  error: VoiceInviteErrorPayload,
) {
  if (
    error.code === "VOICE_INVITE_FORBIDDEN" ||
    error.code === "VOICE_INVITE_TARGET_FORBIDDEN"
  ) {
    return t("voice.invite.permissionDenied");
  }
  if (error.code === "VOICE_INVITE_TARGET_OFFLINE") {
    return t("voice.invite.offline");
  }
  if (error.code === "VOICE_INVITE_RATE_LIMITED") {
    return t("voice.invite.rateLimited");
  }
  if (error.code === "VOICE_INVITE_EXPIRED") {
    return t("voice.invite.expired");
  }
  return t("voice.invite.unavailable");
}

export function VoiceInviteToasts() {
  const { t } = useI18n();
  const router = useRouter();
  const [invites, setInvites] = useState<VoiceInviteEntry[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const handleInviteReceived = (invite: VoiceInvitePayload) => {
      setInvites((current) => {
        const withoutDuplicate = current.filter((entry) => entry.id !== invite.id);
        return [{ ...invite }, ...withoutDuplicate].slice(0, 3);
      });
    };

    const handleInviteAccepted = (data: {
      channelId: string;
      inviteId: string;
      serverId: string;
    }) => {
      setInvites((current) => current.filter((entry) => entry.id !== data.inviteId));
      router.push(`/channels/${data.serverId}/${data.channelId}`);
    };

    const handleInviteError = (error: VoiceInviteErrorPayload) => {
      if (!error.inviteId) {
        return;
      }

      setInvites((current) =>
        current.map((entry) =>
          entry.id === error.inviteId
            ? {
                ...entry,
                accepting: false,
                errorMessage: getInviteErrorMessage(t, error),
              }
            : entry,
        ),
      );
    };

    socket.on("voice:invite:received", handleInviteReceived);
    socket.on("voice:invite:accepted", handleInviteAccepted);
    socket.on("voice:invite:error", handleInviteError);

    return () => {
      socket.off("voice:invite:received", handleInviteReceived);
      socket.off("voice:invite:accepted", handleInviteAccepted);
      socket.off("voice:invite:error", handleInviteError);
    };
  }, [router, t]);

  useEffect(() => {
    if (invites.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      const now = Date.now();
      setInvites((current) => current.filter((entry) => Date.parse(entry.expiresAt) > now));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [invites.length]);

  if (invites.length === 0) {
    return null;
  }

  const dismissInvite = (invite: VoiceInviteEntry, options: { notifyDeclined?: boolean } = {}) => {
    if (options.notifyDeclined !== false && Date.parse(invite.expiresAt) > Date.now()) {
      getSocket().emit("voice:invite:decline", {
        channelId: invite.channelId,
        inviteId: invite.id,
        serverId: invite.serverId,
      });
    }

    setInvites((current) => current.filter((entry) => entry.id !== invite.id));
  };

  const acceptInvite = (invite: VoiceInviteEntry) => {
    if (Date.parse(invite.expiresAt) <= Date.now()) {
      setInvites((current) =>
        current.map((entry) =>
          entry.id === invite.id
            ? {
                ...entry,
                accepting: false,
                errorMessage: t("voice.invite.expired"),
              }
            : entry,
        ),
      );
      return;
    }

    setInvites((current) =>
      current.map((entry) =>
        entry.id === invite.id ? { ...entry, accepting: true, errorMessage: undefined } : entry,
      ),
    );
    getSocket().emit("voice:invite:accept", {
      channelId: invite.channelId,
      inviteId: invite.id,
      serverId: invite.serverId,
    });
  };

  return (
    <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)+5rem)] z-[95] flex w-[min(92vw,24rem)] flex-col gap-3">
      {invites.map((invite) => {
        const displayName = invite.fromUser.displayName || invite.fromUser.username;

        return (
          <article
            className="pointer-events-auto overflow-hidden rounded-[26px] border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--surface-card)/0.96)] p-3 shadow-[0_22px_70px_hsl(var(--shadow-color)/0.18)] backdrop-blur-2xl"
            key={invite.id}
          >
            <div className="flex items-start gap-3">
              <div className="relative shrink-0">
                <Avatar
                  alt={displayName}
                  className="h-11 w-11 border-none text-xs"
                  fallback={displayName}
                  src={invite.fromUser.avatarUrl}
                />
                <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[hsl(var(--surface-card))] bg-[hsl(var(--primary))] text-white shadow-[0_10px_24px_hsl(var(--primary)/0.28)]">
                  <PhoneCall className="h-3 w-3" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-app-foreground">
                      {t("voice.invite.title")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-app-muted">
                      {t("voice.invite.description", {
                        channel: invite.channelName,
                        server: invite.serverName,
                        user: displayName,
                      })}
                    </p>
                  </div>
                  <button
                    aria-label={t("voice.invite.dismiss")}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    onClick={() => dismissInvite(invite)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {invite.errorMessage ? (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[hsl(var(--danger)/0.18)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-xs font-semibold text-[hsl(var(--danger))]">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{invite.errorMessage}</span>
                  </div>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    className={cn(
                      "inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.20)]",
                    )}
                    disabled={invite.accepting}
                    onClick={() => acceptInvite(invite)}
                    type="button"
                  >
                    {invite.accepting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {t("voice.invite.accept")}
                  </button>
                  <button
                    className="inline-flex min-h-9 flex-1 items-center justify-center rounded-full border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.48)] px-3 text-xs font-bold text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    onClick={() => dismissInvite(invite)}
                    type="button"
                  >
                    {t("voice.invite.dismiss")}
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
