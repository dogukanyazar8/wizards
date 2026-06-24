"use client";

import {
  AtSign,
  BellOff,
  ChevronRight,
  Download,
  FileText,
  ImageIcon,
  Search,
  ShieldCheck,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DMConversationDTO, DMParticipantDTO } from "@wizards/types";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  getDmStatusDotClass,
  getDmStatusKey,
} from "@/components/dm/dm-conversation";
import {
  type DmSharedAttachment,
  getDmSharedAttachmentSummary,
} from "@/lib/dm/details";
import {
  dmQueryKeys,
  fetchDMMutualServers,
} from "@/lib/dm/client";
import type { DMMutualServerSummary } from "@/lib/dm/types";
import { getMessagesQueryKey, type MessagePages } from "@/hooks/use-messages";
import {
  isMessageImageContentType,
  isMessageVideoContentType,
} from "@/lib/messages/attachment-rules";
import { cn } from "@/lib/utils";

type DmDetailsPanelProps = {
  className?: string;
  conversation: DMConversationDTO;
  onClose?: (() => void) | undefined;
  onOpenSearch?: (() => void) | undefined;
  participant: DMParticipantDTO;
  variant?: "drawer" | "panel";
};

function useCachedDmMessages(conversationId: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => getMessagesQueryKey("dm", conversationId), [conversationId]);

  const getSnapshot = useCallback(
    () => queryClient.getQueryData<MessagePages>(queryKey),
    [queryClient, queryKey],
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        const eventQuery = (event as { query?: { queryKey?: readonly unknown[] } }).query;
        const eventKey = eventQuery?.queryKey;
        if (
          Array.isArray(eventKey) &&
          eventKey[0] === "messages" &&
          eventKey[1] === "dm" &&
          eventKey[2] === conversationId
        ) {
          onStoreChange();
        }
      }),
    [conversationId, queryClient],
  );

  const pages = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => pages?.pages.flatMap((page) => page.messages) ?? [],
    [pages],
  );
}

function formatAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatShortDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function DmDetailsPanel({
  className,
  conversation,
  onClose,
  onOpenSearch,
  participant,
  variant = "panel",
}: DmDetailsPanelProps) {
  const { locale, t } = useI18n();
  const messages = useCachedDmMessages(conversation.id);
  const sharedAttachments = useMemo(() => getDmSharedAttachmentSummary(messages), [messages]);
  const mutualServersQuery = useQuery({
    enabled: Boolean(participant.userId),
    queryFn: () => fetchDMMutualServers(participant.userId),
    queryKey: dmQueryKeys.mutualServers(participant.userId),
    staleTime: 60_000,
  });

  return (
    <aside
      aria-label={t("dm.details.title")}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--background)/0.88)] text-app-foreground backdrop-blur-xl",
        variant === "panel" && "border-l border-[hsl(var(--border)/0.42)]",
        variant === "drawer" && "h-full rounded-l-[30px] border-l border-[hsl(var(--border)/0.54)] shadow-[0_28px_74px_hsl(var(--shadow-color)/0.18)]",
        className,
      )}
      data-testid="dm-details-panel"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-app-soft">
              {t("dm.details.title")}
            </p>
          </div>
          {onClose ? (
            <button
              aria-label={t("dm.details.close")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.72)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="space-y-3">
          <DmProfileCard onOpenSearch={onOpenSearch} participant={participant} />
          <DmMutualServers
            isLoading={mutualServersQuery.isLoading}
            servers={mutualServersQuery.data?.servers ?? []}
          />
          <DmSharedMedia items={sharedAttachments.media} locale={locale} />
          <DmSharedFiles items={sharedAttachments.files} locale={locale} />
          <DmConversationShortcuts onOpenSearch={onOpenSearch} />
        </div>
      </div>
    </aside>
  );
}

export function DmProfileCard({
  onOpenSearch,
  participant,
}: {
  onOpenSearch?: (() => void) | undefined;
  participant: DMParticipantDTO;
}) {
  const { t } = useI18n();
  const displayName = participant.displayName ?? participant.username ?? t("dm.sidebar.unknownUser");
  const handle = participant.username ? `@${participant.username}` : null;
  const statusLabel = participant.customStatus ?? t(getDmStatusKey(participant.status));

  return (
    <section className="rounded-[24px] bg-[hsl(var(--surface-soft)/0.48)] p-3.5">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar
            alt={displayName}
            className="h-14 w-14 border-[hsl(var(--primary)/0.18)] text-base shadow-[0_16px_30px_hsl(var(--shadow-color)/0.09)]"
            fallback={displayName}
            src={participant.avatarUrl}
          />
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-0 right-0 h-4 w-4 rounded-full border-[3px] border-[hsl(var(--surface-soft))]",
              getDmStatusDotClass(participant.status),
            )}
          />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="truncate text-base font-black text-app-foreground">{displayName}</h2>
          {handle ? (
            <p className="mt-0.5 truncate text-xs font-semibold text-app-muted">{handle}</p>
          ) : null}
          <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-[hsl(var(--success)/0.11)] px-2.5 py-1 text-[11px] font-black text-[hsl(var(--success))]">
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", getDmStatusDotClass(participant.status))}
            />
            <span className="truncate">{statusLabel}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <button
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-[16px] bg-[hsl(var(--surface-card)/0.68)] text-xs font-black text-app-muted transition hover:bg-[hsl(var(--surface-card)/0.9)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled
          title={t("dm.header.voiceComingSoon")}
          type="button"
        >
          <UserRound className="h-4 w-4" />
          {t("dm.details.profileAction")}
        </button>
        <button
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-[16px] bg-[hsl(var(--surface-card)/0.68)] text-xs font-black text-app-muted transition hover:bg-[hsl(var(--surface-card)/0.9)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={!onOpenSearch}
          onClick={onOpenSearch}
          type="button"
        >
          <Search className="h-4 w-4" />
          {t("dm.details.searchAction")}
        </button>
        <button
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-[16px] bg-[hsl(var(--surface-card)/0.68)] text-xs font-black text-app-muted transition hover:bg-[hsl(var(--surface-card)/0.9)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-55"
          disabled
          title={t("dm.header.voiceComingSoon")}
          type="button"
        >
          <BellOff className="h-4 w-4" />
          {t("dm.details.muteAction")}
        </button>
      </div>

      <div className="mt-2.5 grid gap-1.5 text-xs font-semibold text-app-muted">
        <div className="flex min-w-0 items-center gap-2 rounded-[15px] bg-[hsl(var(--surface-card)/0.62)] px-2.5 py-1.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
          <span className="truncate">{t("dm.details.whisprUser")}</span>
        </div>
        {handle ? (
          <div className="flex min-w-0 items-center gap-2 rounded-[15px] bg-[hsl(var(--surface-card)/0.62)] px-2.5 py-1.5">
            <AtSign className="h-4 w-4 shrink-0 text-app-muted" />
            <span className="truncate">{handle}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function DmMutualServers({
  isLoading,
  servers,
}: {
  isLoading: boolean;
  servers: DMMutualServerSummary[];
}) {
  const { t } = useI18n();

  return (
    <section className="space-y-1.5" data-testid="dm-mutual-servers">
      <PanelTitle title={t("dm.details.mutualServers")} />
      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              className="flex items-center gap-2 rounded-[16px] px-2 py-1.5"
              key={index}
            >
              <span className="h-8 w-8 animate-pulse rounded-[14px] bg-[hsl(var(--surface-soft)/0.62)]" />
              <span className="h-3.5 flex-1 animate-pulse rounded-full bg-[hsl(var(--surface-soft)/0.62)]" />
            </div>
          ))}
        </div>
      ) : servers.length > 0 ? (
        <div className="space-y-1">
          {servers.map((server) => (
            <div
              className="flex items-center gap-2 rounded-[16px] px-2 py-1.5 text-sm font-bold text-app-foreground"
              key={server.id}
            >
              <Avatar
                alt={server.name}
                className="h-8 w-8 rounded-[14px] bg-[hsl(var(--primary)/0.1)] text-[11px] font-black text-[hsl(var(--primary))]"
                fallback={server.shortName ?? server.name}
                src={server.iconUrl}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{server.name}</span>
                <span className="block truncate text-[11px] font-semibold text-app-muted">
                  {t("dm.details.memberCount", { count: server.memberCount })}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-app-soft" />
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanelMessage icon={<ShieldCheck className="h-4 w-4" />} text={t("dm.details.noMutualServers")} />
      )}
    </section>
  );
}

export function DmSharedMedia({
  items,
  locale,
}: {
  items: DmSharedAttachment[];
  locale: string;
}) {
  const { t } = useI18n();

  return (
    <section className="space-y-1.5" data-testid="dm-shared-media">
      <PanelTitle description={t("dm.details.loadedOnly")} title={t("dm.details.sharedMedia")} />
      {items.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((item) => (
            <SharedMediaTile item={item} key={item.attachment.id} locale={locale} />
          ))}
        </div>
      ) : (
        <EmptyPanelMessage icon={<ImageIcon className="h-4 w-4" />} text={t("dm.details.noSharedMedia")} />
      )}
    </section>
  );
}

export function DmSharedFiles({
  items,
  locale,
}: {
  items: DmSharedAttachment[];
  locale: string;
}) {
  const { t } = useI18n();

  return (
    <section className="space-y-1.5" data-testid="dm-shared-files">
      <PanelTitle description={t("dm.details.loadedOnly")} title={t("dm.details.sharedFiles")} />
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item) => (
            <SharedFileRow item={item} key={item.attachment.id} locale={locale} />
          ))}
        </div>
      ) : (
        <EmptyPanelMessage icon={<FileText className="h-4 w-4" />} text={t("dm.details.noSharedFiles")} />
      )}
    </section>
  );
}

export function DmConversationShortcuts({
  onOpenSearch,
}: {
  onOpenSearch?: (() => void) | undefined;
}) {
  const { t } = useI18n();

  if (!onOpenSearch) {
    return null;
  }

  return (
    <section className="space-y-1.5">
      <PanelTitle title={t("dm.details.shortcuts")} />
      <button
        className="flex w-full items-center gap-2.5 rounded-[17px] bg-[hsl(var(--surface-soft)/0.48)] px-2.5 py-2 text-left text-sm font-bold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.74)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        onClick={onOpenSearch}
        type="button"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
          <Search className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{t("dm.details.searchConversation")}</span>
      </button>
    </section>
  );
}

function PanelTitle({
  description,
  title,
}: {
  description?: string;
  title: string;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-app-soft">
        {title}
      </h3>
      {description ? (
        <p className="mt-0.5 text-[10.5px] font-semibold leading-4 text-app-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function EmptyPanelMessage({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[17px] bg-[hsl(var(--surface-soft)/0.38)] px-2.5 py-2 text-xs font-semibold text-app-muted">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[13px] bg-[hsl(var(--surface-card)/0.76)] text-app-soft">
        {icon}
      </span>
      <span className="min-w-0 flex-1">{text}</span>
    </div>
  );
}

function SharedMediaTile({ item, locale }: { item: DmSharedAttachment; locale: string }) {
  const attachment = item.attachment;
  const isImage = isMessageImageContentType(attachment.contentType);
  const isVideo = isMessageVideoContentType(attachment.contentType);
  const previewUrl = attachment.thumbnailUrl ?? attachment.url;
  const label = `${attachment.filename} ${formatShortDate(item.messageCreatedAt, locale)}`.trim();

  return (
    <a
      aria-label={label}
      className="group relative block aspect-square overflow-hidden rounded-[15px] bg-[hsl(var(--surface-soft)/0.58)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      href={attachment.url}
      rel="noreferrer"
      target="_blank"
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={attachment.filename}
          className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03] motion-reduce:transition-none"
          src={previewUrl}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-app-muted">
          <Video className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      {isVideo ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/55 p-1 text-white">
          <Video className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : null}
    </a>
  );
}

function SharedFileRow({ item, locale }: { item: DmSharedAttachment; locale: string }) {
  const attachment = item.attachment;
  const size = formatAttachmentSize(attachment.size);
  const date = formatShortDate(item.messageCreatedAt, locale);
  const meta = [size, date].filter(Boolean).join(" / ");

  return (
    <a
      className="flex min-w-0 items-center gap-2 rounded-[17px] bg-[hsl(var(--surface-soft)/0.42)] px-2.5 py-2 text-left transition hover:bg-[hsl(var(--surface-soft)/0.68)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      download={attachment.filename}
      href={attachment.url}
      rel="noreferrer"
      target="_blank"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] bg-[hsl(var(--surface-card)/0.8)] text-[hsl(var(--primary))]">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black text-app-foreground">
          {attachment.filename}
        </span>
        {meta ? (
          <span className="mt-0.5 block truncate text-[11px] font-semibold text-app-muted">
            {meta}
          </span>
        ) : null}
      </span>
      <Download className="h-4 w-4 shrink-0 text-app-soft" />
    </a>
  );
}
