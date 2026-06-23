"use client";

import type { ReactNode, RefObject } from "react";
import { Info, MonitorUp, MoreHorizontal, Phone, Search } from "lucide-react";
import type { DMParticipantDTO } from "@wizards/types";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

export function getDmStatusDotClass(status: DMParticipantDTO["status"] | undefined) {
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

export function getDmStatusKey(status: DMParticipantDTO["status"] | undefined) {
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

interface DmConversationHeaderProps {
  children?: ReactNode;
  onOpenDetails?: (() => void) | undefined;
  onOpenSearch: () => void;
  onStartScreenShare: () => void;
  participant: DMParticipantDTO;
  screenShareStarting: boolean;
  searchButtonRef: RefObject<HTMLButtonElement | null>;
  searchOpen: boolean;
}

export function DmConversationHeader({
  children,
  onOpenDetails,
  onOpenSearch,
  onStartScreenShare,
  participant,
  screenShareStarting,
  searchButtonRef,
  searchOpen,
}: DmConversationHeaderProps) {
  const { t } = useI18n();
  const displayName = participant.displayName ?? participant.username ?? t("dm.sidebar.unknownUser");
  const statusLabel = participant.customStatus ?? t(getDmStatusKey(participant.status));
  const handle = participant.username ? `@${participant.username}` : null;

  return (
    <header
      className="sticky top-0 z-20 border-b border-[hsl(var(--border)/0.34)] bg-[hsl(var(--background)/0.76)] px-3 py-2 backdrop-blur-xl md:px-4"
      data-testid="dm-conversation-header"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar
              alt={displayName}
              className="h-10 w-10 text-sm shadow-[0_10px_24px_hsl(var(--shadow-color)/0.07)] md:h-11 md:w-11"
              fallback={displayName}
              src={participant.avatarUrl}
            />
            <span
              aria-hidden="true"
              className={cn(
                "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[hsl(var(--background))]",
                getDmStatusDotClass(participant.status),
              )}
            />
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-5 text-app-foreground md:text-[15px]">
              {displayName}
            </h1>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-semibold text-app-muted">
              {handle ? <span className="min-w-0 truncate">{handle}</span> : null}
              {handle ? <span aria-hidden="true">/</span> : null}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", getDmStatusDotClass(participant.status))}
                />
                <span className="truncate">{statusLabel}</span>
              </span>
            </div>
          </div>
        </div>

        <DmConversationToolbar
          onOpenDetails={onOpenDetails}
          onOpenSearch={onOpenSearch}
          onStartScreenShare={onStartScreenShare}
          screenShareStarting={screenShareStarting}
          searchButtonRef={searchButtonRef}
          searchOpen={searchOpen}
        />
      </div>

      {children}
    </header>
  );
}

interface DmConversationToolbarProps {
  onOpenDetails?: (() => void) | undefined;
  onOpenSearch: () => void;
  onStartScreenShare: () => void;
  screenShareStarting: boolean;
  searchButtonRef: RefObject<HTMLButtonElement | null>;
  searchOpen: boolean;
}

export function DmConversationToolbar({
  onOpenDetails,
  onOpenSearch,
  onStartScreenShare,
  screenShareStarting,
  searchButtonRef,
  searchOpen,
}: DmConversationToolbarProps) {
  const { t } = useI18n();
  const buttonClass =
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60 md:h-9 md:w-9";

  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-[18px] bg-[hsl(var(--surface-soft)/0.34)] p-1">
      <button
        aria-label={t("dm.header.voiceCall")}
        className={buttonClass}
        disabled
        title={t("dm.header.voiceComingSoon")}
        type="button"
      >
        <Phone className="h-4 w-4" />
      </button>
      <button
        aria-label={t("dm.screenShare.share")}
        className={buttonClass}
        disabled={screenShareStarting}
        onClick={onStartScreenShare}
        title={t("dm.screenShare.share")}
        type="button"
      >
        <MonitorUp className="h-4 w-4" />
      </button>
      <button
        aria-expanded={searchOpen}
        aria-label={t("chat.search.open")}
        className={buttonClass}
        data-testid="message-search-open"
        onClick={onOpenSearch}
        ref={searchButtonRef}
        title={t("chat.search.open")}
        type="button"
      >
        <Search className="h-4 w-4" />
      </button>
      {onOpenDetails ? (
        <button
          aria-label={t("dm.details.open")}
          className={buttonClass}
          data-testid="dm-details-open"
          onClick={onOpenDetails}
          title={t("dm.details.open")}
          type="button"
        >
          <Info className="h-4 w-4" />
        </button>
      ) : null}
      <button
        aria-label={t("chat.message.moreActions")}
        className={buttonClass}
        disabled
        title={t("dm.header.voiceComingSoon")}
        type="button"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}

export function DmMessageSurface({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <section
      aria-label={t("dm.header.directMessage")}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent"
      data-testid="dm-message-surface"
    >
      {children}
    </section>
  );
}

export function DmComposer({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0" data-testid="dm-composer">
      {children}
    </div>
  );
}
