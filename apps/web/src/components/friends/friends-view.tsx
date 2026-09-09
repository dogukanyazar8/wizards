"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowDownAZ, ArrowUpDown, Clock3, Search, Users } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeFriendsTab, type FriendsSort, type FriendsTab } from "@wizards/types";

import { DISPLAY_FONT, HomeAvatar } from "@/components/home/home-primitives";
import { GroupCreateDialog } from "@/components/dm/group-create-dialog";
import { FriendRow, type FriendRowActor } from "@/components/friends/friend-row";
import { FriendRowMenu, type InvitableServer } from "@/components/friends/friend-row-menu";
import { FriendsTabs } from "@/components/friends/friends-tabs";
import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocket } from "@/hooks/use-socket";
import { useUiScaleStep } from "@/hooks/use-ui-scale-step";
import {
  createDMConversationRequest,
  createGroupConversationRequest,
  dmQueryKeys,
  upsertDMConversationPageData,
  type DMConversationsInfiniteData,
} from "@/lib/dm/client";
import {
  actOnFriendRequestRequest,
  applyFriendPresenceUpdate,
  blockFriendRequest,
  cancelFriendRequestRequest,
  fetchBlockedFriends,
  fetchFriends,
  fetchPendingFriends,
  FriendsClientError,
  friendsQueryKeys,
  removeFriendRequest,
  sendFriendRequestRequest,
  unblockFriendRequest,
} from "@/lib/friends/client";
import {
  filterFriends,
  sortFriends,
  splitFriendsByPresence,
  type FriendSortContext,
} from "@/lib/friends/sort";
import type {
  FriendDto,
  FriendErrorCode,
  FriendRequestDto,
  PendingFriendsResponse,
} from "@/lib/friends/types";
import { deriveFriendStatusText, resolveHomeCopy } from "@/lib/home/presentation";
import { selectMessagesDensity } from "@/lib/messages/density";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import {
  MESSAGES_FRIENDS_ROUTE,
  clearMessagesActionHref,
  messagesConversationHref,
} from "@/lib/messages/routes";
import { useFriendLastInteraction } from "@/hooks/use-friend-last-interaction";
import { fetchInvitableServers } from "@/lib/messages/screen-client";
import { addServerMemberRequest } from "@/lib/workspace/client";
import {
  fetchFriendSuggestions,
  fetchFriendsSort,
  updateFriendsSort,
} from "@/lib/messages/screen-client";
import { cn } from "@/lib/utils";

/**
 * Arkadaşlar görünümü — SPEC §4.
 *
 * Dört sekme (karar #8): `Tümü` · `Arkadaş ekle` · `Bekleyen` · `Engellenenler`.
 * Eski `Çevrimiçi` sekmesi düştü; çevrimiçi/çevrimdışı artık `Tümü` içinde iki
 * bölüm. `?dmTab=online` derin bağlantısı hâlâ çalışıyor ve `all`'a düşüyor —
 * bir yer imi bozulmuyor, aynı kişileri bir başlık altında gösteriyor.
 *
 * Veri katmanı (sorgular, iyimser mutasyonlar, hata eşlemesi) olduğu gibi
 * korundu; değişen şey **sunum**.
 */

const { friends: metrics } = MESSAGES_METRICS;

type ConfirmState =
  { friend: FriendDto; type: "block" } | { friend: FriendDto; type: "remove" } | null;

const EMPTY_PENDING: PendingFriendsResponse = { incoming: [], outgoing: [] };
const EMPTY_FRIENDS: FriendDto[] = [];
const EMPTY_SUGGESTIONS: Awaited<ReturnType<typeof fetchFriendSuggestions>> = [];
/** Sorgu boşken sabit referans; her render'da yeni dizi menüyü gereksiz çizerdi. */
const EMPTY_SERVERS: readonly InvitableServer[] = [];
const EMPTY_BLOCKED_USERS: Array<{
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
}> = [];

/**
 * Satır + süzme ve sıralamanın istediği alanlar. `username` `FriendRowActor`'da
 * yok (satır `@handle` çiziyor) ama süzme onda da arıyor; `source` ise yıkıcı
 * eylemlerin ihtiyaç duyduğu ham DTO.
 */
type FriendListRow = FriendRowActor & { readonly source: FriendDto; readonly username: string };

const SORT_LABEL_KEY: Readonly<Record<FriendsSort, string>> = Object.freeze({
  name: "messages.friends.sort.name",
  recent: "messages.friends.sort.recent",
  status: "messages.friends.sort.status",
});

const SORT_META = Object.freeze({
  name: { Icon: ArrowDownAZ, testId: "friends-sort-name-icon" },
  recent: { Icon: Clock3, testId: "friends-sort-recent-icon" },
  status: { Icon: Activity, testId: "friends-sort-status-icon" },
} satisfies Record<FriendsSort, { Icon: typeof Activity; testId: string }>);

function matchesSearch(
  normalizedQuery: string,
  locale: string,
  ...values: Array<null | string | undefined>
) {
  return (
    normalizedQuery.length === 0 ||
    values.some((value) => value?.toLocaleLowerCase(locale).includes(normalizedQuery))
  );
}

function FriendsToolbar({
  onQueryChange,
  onSelectSort,
  onToggleSortMenu,
  query,
  sort,
  sortMenu,
}: {
  onQueryChange: (value: string) => void;
  onSelectSort: (sort: FriendsSort) => void;
  onToggleSortMenu: () => void;
  query: string;
  sort: FriendsSort;
  sortMenu: boolean;
}) {
  const { t } = useI18n();

  return (
    <div
      className="flex shrink-0 items-center"
      data-testid="friends-toolbar"
      style={{
        gap: pxToRem(metrics.toolbarGap),
        padding: `${pxToRem(metrics.toolbarPaddingY)} ${pxToRem(metrics.toolbarPaddingX)}`,
      }}
    >
      <label
        className="flex min-w-0 flex-1 items-center bg-[hsl(var(--surface-soft)/0.7)]"
        style={{
          border: `${hairline()} solid hsl(var(--border)/0.5)`,
          borderRadius: pxToRem(metrics.searchRadius),
          gap: pxToRem(metrics.searchGap),
          height: pxToRem(metrics.searchHeight),
          padding: `0 ${pxToRem(metrics.searchPaddingX)}`,
        }}
      >
        <Search
          aria-hidden="true"
          className="shrink-0 text-[hsl(var(--text-muted))]"
          style={{
            height: pxToRem(metrics.searchIconSize),
            width: pxToRem(metrics.searchIconSize),
          }}
        />
        <input
          className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))]"
          data-testid="friends-search"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("messages.friends.searchPlaceholder")}
          style={{ fontSize: pxToRem(metrics.searchFontSize) }}
          type="search"
          value={query}
        />
      </label>

      <div className="relative shrink-0">
        <button
          aria-expanded={sortMenu}
          aria-haspopup="menu"
          aria-label={t("messages.friends.sort.aria")}
          className="flex items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition hover:bg-[var(--surface-hover)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="friends-sort"
          onClick={onToggleSortMenu}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(metrics.sortRadius),
            fontSize: pxToRem(metrics.sortFontSize),
            fontWeight: 600,
            gap: pxToRem(metrics.sortGap),
            height: pxToRem(metrics.sortHeight),
            padding: `0 ${pxToRem(metrics.sortPaddingX)}`,
          }}
          type="button"
        >
          <ArrowUpDown
            aria-hidden="true"
            style={{
              height: pxToRem(metrics.sortIconSize),
              width: pxToRem(metrics.sortIconSize),
            }}
          />
          {t(SORT_LABEL_KEY[sort])}
        </button>

        {sortMenu ? (
          <div
            className="absolute right-0 z-30 mt-1 bg-[hsl(var(--surface-card))] shadow-[0_24px_50px_-22px_hsl(var(--shadow-color))]"
            data-testid="friends-sort-menu"
            role="menu"
            style={{
              border: `${hairline()} solid hsl(var(--border))`,
              borderRadius: pxToRem(metrics.menuRadius),
              padding: pxToRem(metrics.menuPadding),
              width: pxToRem(metrics.menuWidth),
            }}
          >
            {(["status", "name", "recent"] as const).map((option) => {
              const { Icon: SortIcon, testId } = SORT_META[option];

              return (
                <button
                  aria-checked={option === sort}
                  className={cn(
                    "flex w-full items-center text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                    option === sort
                      ? "text-[hsl(var(--primary))]"
                      : "text-[hsl(var(--text-secondary))]",
                  )}
                  data-testid={`friends-sort-${option}`}
                  key={option}
                  onClick={() => onSelectSort(option)}
                  role="menuitemradio"
                  style={{
                    borderRadius: pxToRem(metrics.menuItemRadius),
                    fontSize: pxToRem(metrics.menuItemFontSize),
                    fontWeight: 500,
                    gap: pxToRem(metrics.menuItemPaddingY),
                    padding: `${pxToRem(metrics.menuItemPaddingY)} ${pxToRem(
                      metrics.menuItemPaddingX,
                    )}`,
                  }}
                  type="button"
                >
                  <SortIcon
                    aria-hidden="true"
                    className="shrink-0"
                    data-testid={testId}
                    style={{
                      height: pxToRem(metrics.sortIconSize),
                      width: pxToRem(metrics.sortIconSize),
                    }}
                  />
                  {t(SORT_LABEL_KEY[option])}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getAddFriendErrorMessage(
  code: FriendErrorCode | undefined,
  t: (key: string, values?: Record<string, number | string>) => string,
) {
  if (code === "ALREADY_FRIENDS") {
    return t("friends.addFriend.errors.alreadyFriends");
  }

  if (code === "BLOCKED") {
    return t("friends.addFriend.errors.blocked");
  }

  if (code === "NOT_FOUND") {
    return t("friends.addFriend.errors.notFound");
  }

  if (code === "ALREADY_PENDING") {
    return t("friends.addFriend.errors.alreadyPending");
  }

  return t("friends.addFriend.errors.unknown");
}

/** SPEC §4: durum satırı presence rengini alır, `success`'te muted kalır. */
function resolveStatusTone(status: FriendDto["status"]): FriendRowActor["statusTone"] {
  if (status === "DND") {
    return "danger";
  }

  return status === "IDLE" ? "warning" : "muted";
}

function SectionHeading({
  count,
  countTone,
  label,
}: {
  count: number;
  countTone?: "success" | undefined;
  label: string;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: pxToRem(metrics.sectionGap),
        padding: `${pxToRem(metrics.sectionPaddingTop)} ${pxToRem(
          metrics.sectionPaddingX,
        )} ${pxToRem(metrics.sectionPaddingBottom)}`,
      }}
    >
      <span
        className={cn("uppercase text-[hsl(var(--text-muted))]", DISPLAY_FONT)}
        style={{
          fontSize: pxToRem(metrics.sectionLabelFontSize),
          fontWeight: 600,
          letterSpacing: "0.15em",
        }}
      >
        {label}
      </span>
      <span
        className={cn(
          countTone === "success"
            ? "text-[hsl(var(--success))]"
            : "text-[hsl(var(--text-muted)/0.8)]",
          DISPLAY_FONT,
        )}
        style={{ fontSize: pxToRem(metrics.sectionCountFontSize), fontWeight: 600 }}
      >
        {count}
      </span>
      <span
        aria-hidden="true"
        className="flex-1"
        style={{ background: "hsl(var(--border)/0.5)", height: hairline() }}
      />
    </div>
  );
}

function EmptyLine({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p
      className="text-center text-[hsl(var(--text-muted))]"
      data-testid={testId}
      style={{
        fontSize: pxToRem(metrics.rowStatusFontSize),
        padding: `${pxToRem(metrics.rowPaddingY * 4)} ${pxToRem(metrics.rowPaddingX)}`,
      }}
    >
      {children}
    </p>
  );
}

function CompactRow({
  action,
  meta,
  name,
  avatarUrl,
  dimmed,
  testId,
}: {
  action: React.ReactNode;
  avatarUrl: string | null;
  dimmed?: number | undefined;
  meta: string;
  name: string;
  testId: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center transition-colors hover:bg-[hsl(var(--surface-soft)/0.7)]"
      data-testid={testId}
      style={{
        borderRadius: pxToRem(metrics.compactRowRadius),
        gap: pxToRem(metrics.compactRowGap),
        padding: `${pxToRem(metrics.compactRowPaddingY)} ${pxToRem(metrics.compactRowPaddingX)}`,
      }}
    >
      <span className="shrink-0" style={dimmed ? { opacity: dimmed } : undefined}>
        <HomeAvatar
          avatarUrl={avatarUrl}
          displayName={name}
          fontSize={metrics.rowNameFontSize}
          size={metrics.rowAvatarSize}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[hsl(var(--foreground))]"
          style={{ fontSize: pxToRem(metrics.rowNameFontSize), fontWeight: 600 }}
        >
          {name}
        </span>
        <span
          className="block truncate text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(metrics.rowStatusFontSize),
            marginTop: pxToRem(metrics.rowStatusMarginTop),
          }}
        >
          {meta}
        </span>
      </span>
      <span
        className="flex shrink-0 items-center"
        style={{ gap: pxToRem(metrics.compactActionGap) }}
      >
        {action}
      </span>
    </div>
  );
}

function CompactButton({
  children,
  onClick,
  testId,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
  tone?: "danger" | "neutral" | "primary" | "tint";
}) {
  return (
    <button
      className={cn(
        "shrink-0 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        tone === "primary" && "bg-[hsl(var(--primary))] text-white hover:brightness-110",
        tone === "tint" &&
          "bg-[hsl(var(--primary)/0.16)] text-[var(--primary-readable)] hover:bg-[hsl(var(--primary)/0.26)]",
        tone === "danger" &&
          "bg-[hsl(var(--surface-card))] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.12)]",
        tone === "neutral" &&
          "bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] hover:bg-[var(--surface-hover)] hover:text-[hsl(var(--foreground))]",
      )}
      data-testid={testId}
      onClick={onClick}
      style={{
        ...(tone === "primary" || tone === "tint"
          ? {}
          : { border: `${hairline()} solid hsl(var(--border))` }),
        borderRadius: pxToRem(metrics.compactActionRadius),
        fontSize: pxToRem(metrics.compactActionFontSize),
        fontWeight: 600,
        height: pxToRem(metrics.compactActionHeight),
        padding: `0 ${pxToRem(metrics.compactActionPaddingX)}`,
      }}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * `currentUserId` **almıyor**: bu görünüm artık görüntüleyenin kimliğini hiçbir
 * yerde kullanmıyor. Sunucudan gelen listeler zaten görüntüleyene göre süzülü,
 * ve taşınan ama okunmayan bir prop, gelecekte birinin ona güvenmesi demek.
 */
export type FriendsViewProps = {
  /**
   * `Son etkileşim` sıralaması için gerekli: bir 1:1 sohbetin karşı tarafı
   * "benden başkası" diye bulunuyor ve o karşılaştırma kimlik olmadan
   * yapılamaz.
   */
  currentUserId: string;
};

export function FriendsView({ currentUserId }: FriendsViewProps) {
  const lastInteractionAt = useFriendLastInteraction(currentUserId);
  const { locale, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const scale = useUiScaleStep();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [manualTab, setManualTab] = useState<FriendsTab>("all");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: "error" | "success" } | null>(
    null,
  );
  const [username, setUsername] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [query, setQuery] = useState("");
  const [sortMenu, setSortMenu] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ friendId: string; x: number; y: number } | null>(null);
  const [sentSuggestionIds, setSentSuggestionIds] = useState<ReadonlySet<string>>(new Set());

  const requestedTab = searchParams.get("dmTab");
  // `?dmTab=online` bir hata değil, eski bir bağlantı: `normalizeFriendsTab` onu
  // `all`'a düşürüyor ve yer imi çalışmaya devam ediyor.
  const activeTab: FriendsTab = requestedTab ? normalizeFriendsTab(requestedTab) : manualTab;
  const groupDialogOpen = searchParams.get("dmAction") === "group";

  const friendsQuery = useQuery({
    queryFn: fetchFriends,
    queryKey: friendsQueryKeys.list,
    staleTime: 30_000,
  });
  const pendingQuery = useQuery({
    queryFn: fetchPendingFriends,
    queryKey: friendsQueryKeys.pending,
    staleTime: 15_000,
  });
  const blockedQuery = useQuery({
    enabled: activeTab === "blocked",
    queryFn: fetchBlockedFriends,
    queryKey: friendsQueryKeys.blocked,
    staleTime: 30_000,
  });
  // Öneriler yalnız sekme açıkken çekilir: ortak arkadaş sayısı bir toplama
  // sorgusu ve `Tümü` sekmesinde okunmayacak.
  const suggestionsQuery = useQuery({
    enabled: activeTab === "add",
    queryFn: fetchFriendSuggestions,
    queryKey: ["friends", "suggestions"] as const,
    staleTime: 60_000,
  });
  const sortQuery = useQuery({
    queryFn: fetchFriendsSort,
    queryKey: ["friends", "sort"] as const,
    staleTime: 5 * 60_000,
  });

  const sort: FriendsSort = sortQuery.data ?? "status";

  const sortMutation = useMutation({
    mutationFn: updateFriendsSort,
    onMutate: async (next: FriendsSort) => {
      // İyimser: sıralama bir okuma alışkanlığı, isteğin dönmesini beklemek
      // listeyi bir saniye eski sırada bırakırdı.
      const previous = queryClient.getQueryData<FriendsSort>(["friends", "sort"]);
      queryClient.setQueryData(["friends", "sort"], next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["friends", "sort"], context.previous);
      }
    },
  });

  useEffect(() => {
    const handlePresenceUpdate = (update: {
      customStatus: string | null;
      status: FriendDto["status"];
      userId: string;
    }) => {
      queryClient.setQueryData(friendsQueryKeys.list, (current: FriendDto[] | undefined) =>
        applyFriendPresenceUpdate(current, update),
      );
    };
    const handleFriendsUpdated = () => {
      void queryClient.refetchQueries({ queryKey: friendsQueryKeys.root, type: "active" });
    };

    socket.on("presence:update", handlePresenceUpdate);
    socket.on("friends:updated", handleFriendsUpdated);

    return () => {
      socket.off("presence:update", handlePresenceUpdate);
      socket.off("friends:updated", handleFriendsUpdated);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, [queryClient, socket]);

  const friends = friendsQuery.data ?? EMPTY_FRIENDS;
  const pending = pendingQuery.data ?? EMPTY_PENDING;
  const blockedUsers = blockedQuery.data ?? EMPTY_BLOCKED_USERS;
  const suggestions = suggestionsQuery.data ?? EMPTY_SUGGESTIONS;
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const normalizedUsername = username.trim();
  const canSendRequest = normalizedUsername.length >= 2 && debouncedUsername === normalizedUsername;

  const setActiveTab = (next: FriendsTab) => {
    setManualTab(next);
    setSortMenu(false);

    if (requestedTab) {
      // Sekme URL'den geldiyse manuel geçiş onu bırakır; aksi hâlde bağlantıdaki
      // sekme her tıklamadan sonra geri gelirdi.
      router.replace(MESSAGES_FRIENDS_ROUTE, { scroll: false });
    }
  };

  const rows = useMemo<FriendListRow[]>(() => {
    const now = new Date();

    return friends.map((friend) => {
      const name = friend.displayName ?? friend.username;
      const statusCopy = deriveFriendStatusText(
        {
          customStatus: friend.customStatus,
          lastSeenAt: friend.lastSeenAt,
          status: friend.status,
          voiceRoom: friend.voiceRoom
            ? {
                channelName: friend.voiceRoom.channelName,
                serverName: friend.voiceRoom.serverName,
              }
            : null,
        },
        now,
      );

      return {
        avatarUrl: friend.avatarUrl,
        handle: `@${friend.username}`,
        id: friend.id,
        name,
        source: friend,
        status: friend.status,
        // Çevrimdışı satır son görülmeyi gösterir; türetilmiş durum cümlesi
        // orada "Çevrimdışı" derdi ve satır zaten bunu soluk avatarla söylüyor.
        statusText:
          friend.status === "OFFLINE"
            ? friend.lastSeenAt
              ? t("messages.friends.lastSeen", {
                  time: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
                    Math.min(
                      -1,
                      Math.round(
                        (new Date(friend.lastSeenAt).getTime() - now.getTime()) / (60 * 60 * 1000),
                      ),
                    ),
                    "hour",
                  ),
                })
              : null
            : resolveHomeCopy(statusCopy, t),
        statusTone: resolveStatusTone(friend.status),
        username: friend.username,
      };
    });
  }, [friends, locale, t]);

  // Son etkileşim sohbet listesinden türüyor (`useFriendLastInteraction`);
  // arkadaş listesi onu taşımıyor ve ayrı bir uç aynı bilgiyi ikinci kez
  // göndermek olurdu.
  const sortContext = useMemo<FriendSortContext>(
    () => ({ lastInteractionAt }),
    [lastInteractionAt],
  );

  const visibleRows = useMemo(
    () => sortFriends(filterFriends(rows, query), sort, sortContext),
    [query, rows, sort, sortContext],
  );
  const visibleSuggestions = useMemo(
    () =>
      suggestions.filter((suggestion) =>
        matchesSearch(
          normalizedQuery,
          locale,
          suggestion.name,
          suggestion.username,
          suggestion.viaServerName,
        ),
      ),
    [locale, normalizedQuery, suggestions],
  );
  const visibleIncoming = useMemo(
    () =>
      pending.incoming.filter((request) =>
        matchesSearch(normalizedQuery, locale, request.sender.displayName, request.sender.username),
      ),
    [locale, normalizedQuery, pending.incoming],
  );
  const visibleOutgoing = useMemo(
    () =>
      pending.outgoing.filter((request) =>
        matchesSearch(
          normalizedQuery,
          locale,
          request.receiver.displayName,
          request.receiver.username,
        ),
      ),
    [locale, normalizedQuery, pending.outgoing],
  );
  const visibleBlockedUsers = useMemo(
    () =>
      blockedUsers.filter((blocked) =>
        matchesSearch(normalizedQuery, locale, blocked.displayName, blocked.username),
      ),
    [blockedUsers, locale, normalizedQuery],
  );
  const sections = useMemo(() => splitFriendsByPresence(visibleRows), [visibleRows]);
  const counters = useMemo(() => splitFriendsByPresence(rows), [rows]);

  const scheduleFeedbackClear = () => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }

    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 3000);
  };

  const sendRequestMutation = useMutation({
    mutationFn: (value: string) => sendFriendRequestRequest(value),
    onError: (error) => {
      setFeedback({
        message:
          error instanceof FriendsClientError
            ? getAddFriendErrorMessage(error.code, t)
            : t("friends.addFriend.errors.unknown"),
        tone: "error",
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
    onSuccess: (request) => {
      setUsername("");
      setDebouncedUsername("");
      setFeedback({
        message: t("friends.addFriend.success", { username: request.receiver.username }),
        tone: "success",
      });
      scheduleFeedbackClear();
    },
  });

  const requestActionMutation = useMutation<
    FriendRequestDto,
    Error,
    { action: "accept" | "decline"; requestId: string },
    { previousPending: PendingFriendsResponse }
  >({
    mutationFn: ({ action, requestId }) => actOnFriendRequestRequest(requestId, action),
    onError: (_error, _variables, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(friendsQueryKeys.pending, context.previousPending);
      }
    },
    onMutate: async ({ requestId }) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.pending });
      const previousPending =
        queryClient.getQueryData<PendingFriendsResponse>(friendsQueryKeys.pending) ?? EMPTY_PENDING;

      queryClient.setQueryData<PendingFriendsResponse>(friendsQueryKeys.pending, {
        ...previousPending,
        incoming: previousPending.incoming.filter((request) => request.id !== requestId),
      });

      return { previousPending };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const cancelRequestMutation = useMutation<
    { success: true },
    Error,
    string,
    { previousPending: PendingFriendsResponse }
  >({
    mutationFn: (requestId: string) => cancelFriendRequestRequest(requestId),
    onError: (_error, _variables, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(friendsQueryKeys.pending, context.previousPending);
      }
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.pending });
      const previousPending =
        queryClient.getQueryData<PendingFriendsResponse>(friendsQueryKeys.pending) ?? EMPTY_PENDING;

      queryClient.setQueryData<PendingFriendsResponse>(friendsQueryKeys.pending, {
        ...previousPending,
        outgoing: previousPending.outgoing.filter((request) => request.id !== requestId),
      });

      return { previousPending };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const removeFriendMutation = useMutation<
    { success: true },
    Error,
    FriendDto,
    { previousFriends: FriendDto[] | undefined }
  >({
    mutationFn: (friend) => removeFriendRequest(friend.id),
    onMutate: async (friend) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.list });
      const previousFriends = queryClient.getQueryData<FriendDto[]>(friendsQueryKeys.list);

      queryClient.setQueryData<FriendDto[] | undefined>(friendsQueryKeys.list, (current) =>
        current?.filter((candidate) => candidate.id !== friend.id),
      );
      setConfirmState(null);
      setFeedback(null);

      return { previousFriends };
    },
    onError: (_error, _friend, context) => {
      if (context?.previousFriends) {
        queryClient.setQueryData(friendsQueryKeys.list, context.previousFriends);
      }

      setFeedback({ message: t("friends.remove.error"), tone: "error" });
    },
    onSuccess: (_result, friend) => {
      setFeedback({
        message: t("friends.remove.success", { name: friend.displayName ?? friend.username }),
        tone: "success",
      });
      scheduleFeedbackClear();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const blockFriendMutation = useMutation({
    mutationFn: (friendUserId: string) => blockFriendRequest(friendUserId),
    onSettled: async () => {
      setConfirmState(null);
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const unblockFriendMutation = useMutation({
    mutationFn: (friendUserId: string) => unblockFriendRequest(friendUserId),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const openDirectMessageMutation = useMutation({
    mutationFn: (friendUserId: string) => createDMConversationRequest(friendUserId),
    onError: () => {
      setFeedback({ message: t("dm.errors.openConversation"), tone: "error" });
    },
    onSuccess: (conversation) => {
      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(
        dmQueryKeys.list,
        (current) => upsertDMConversationPageData(current, conversation),
      );
      router.push(messagesConversationHref(conversation.id));
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: createGroupConversationRequest,
    onSuccess: (conversation) => {
      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(
        dmQueryKeys.list,
        (current) => upsertDMConversationPageData(current, conversation),
      );
      router.push(messagesConversationHref(conversation.id));
    },
  });

  const handleUsernameChange = (value: string) => {
    setUsername(value);

    if (feedback) {
      setFeedback(null);
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedUsername(value.trim());
      debounceRef.current = null;
    }, 500);
  };

  const skeletonRows = selectMessagesDensity(scale).friendRows;
  const loading = friendsQuery.isLoading;
  const menuFriend = rowMenu ? (rows.find((row) => row.id === rowMenu.friendId) ?? null) : null;

  /**
   * Davet edilebilir sunucular — yetki kararı **sunucuda** (`/v1/servers/invitable`).
   * İstemcide "üyeyse davet edebilir" diye tahmin etmek, kullanıcıya
   * yapamayacağı bir işi gösterip 403 yedirmek olurdu.
   *
   * Sorgu yalnız menü açıkken kurulur: her arkadaş listesi açılışında bir istek
   * daha, hiç açılmayacak bir menü için ödenirdi.
   */
  const invitableServersQuery = useQuery({
    enabled: rowMenu !== null,
    queryFn: fetchInvitableServers,
    queryKey: ["workspace", "servers", "invitable"],
    staleTime: 60_000,
  });
  const invitableServers: readonly InvitableServer[] = invitableServersQuery.data ?? EMPTY_SERVERS;

  /**
   * Davet, sunucuya **üye ekleme** ucunu kullanıyor: davet bağlantısı üretip
   * kullanıcıya göndermek iki adım daha (bağlantı + mesaj) demek ve arkadaş
   * zaten elimizde. Hata durumunda mevcut hata eşlemesi kullanılıyor.
   */
  const inviteToServerMutation = useMutation({
    mutationFn: ({ serverId, username }: { serverId: string; username: string }) =>
      addServerMemberRequest(serverId, username),
    onError: () => {
      setFeedback({ message: t("messages.friends.menu.inviteFailed"), tone: "error" });
      scheduleFeedbackClear();
    },
    onSuccess: (result) => {
      setRowMenu(null);
      setFeedback({
        message: t("messages.friends.menu.inviteSuccess", { name: result.detail.server.name }),
        tone: "success",
      });
      scheduleFeedbackClear();
    },
  });

  return (
    <>
      <div
        /*
         * Liste yüklenirken `true`. Ekran okuyucu, iskelet satırları "içerik"
         * diye okumak yerine bölgenin meşgul olduğunu duyuruyor; bitince
         * `false` olması da "artık hazır" demenin tek makine-okunur yolu.
         */
        aria-busy={loading}
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--surface-base))]"
        data-testid="friends-dashboard"
      >
        <div
          className="flex shrink-0 items-end justify-between"
          style={{
            borderBottom: `${hairline()} solid hsl(var(--border)/0.45)`,
            gap: pxToRem(metrics.headerGap),
            padding: `${pxToRem(metrics.headerPaddingTop)} ${pxToRem(
              metrics.headerPaddingX,
            )} ${pxToRem(metrics.headerPaddingBottom)}`,
          }}
        >
          <div className="min-w-0">
            <div className="flex items-center" style={{ gap: pxToRem(metrics.titleGap) }}>
              <Users
                aria-hidden="true"
                className="shrink-0 text-[hsl(var(--foreground))]"
                style={{
                  height: pxToRem(metrics.titleIconSize),
                  width: pxToRem(metrics.titleIconSize),
                }}
              />
              <h1
                className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
                style={{
                  fontSize: pxToRem(metrics.titleFontSize),
                  fontWeight: metrics.titleWeight,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {t("messages.friends.title")}
              </h1>
            </div>

            <div
              className="flex flex-wrap items-center"
              style={{ gap: pxToRem(metrics.chipsGap), marginTop: pxToRem(metrics.chipsMarginTop) }}
            >
              <Chip
                dotClass="bg-[hsl(var(--success))]"
                label={t("messages.friends.onlineChip", { count: counters.online.length })}
                testId="friends-chip-online"
                toneClass="bg-[hsl(var(--success)/0.14)] text-[var(--success-readable)]"
              />
              <Chip
                dotClass="bg-[hsl(var(--text-muted))]"
                label={t("messages.friends.offlineChip", { count: counters.offline.length })}
                testId="friends-chip-offline"
                toneClass="bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-secondary))]"
              />
              {/*
                Üçüncü çip tıklanabilir (SPEC §10): Bekleyen sekmesine götürür.
                İlk ikisi metin ve `button` değil — tıklanamayan bir şeyi buton
                yapmak, klavye turunda hiçbir şey yapmayan iki durak demek.
              */}
              <button
                className="shrink-0 bg-[hsl(var(--danger)/0.13)] text-[var(--danger-readable)] transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                data-testid="friends-chip-pending"
                onClick={() => setActiveTab("pending")}
                style={{
                  borderRadius: pxToRem(metrics.chipRadius),
                  fontSize: pxToRem(metrics.chipFontSize),
                  fontWeight: 600,
                  padding: `${pxToRem(metrics.chipPaddingY)} ${pxToRem(metrics.chipPaddingX)}`,
                }}
                type="button"
              >
                {t("messages.friends.pendingChip", { count: pending.incoming.length })}
              </button>
            </div>
          </div>

          <FriendsTabs
            active={activeTab}
            onChange={setActiveTab}
            pendingCount={pending.incoming.length}
          />
        </div>

        <FriendsToolbar
          onQueryChange={setQuery}
          onSelectSort={(nextSort) => {
            sortMutation.mutate(nextSort);
            setSortMenu(false);
          }}
          onToggleSortMenu={() => setSortMenu((current) => !current)}
          query={query}
          sort={sort}
          sortMenu={sortMenu}
        />

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          id={`friends-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`friends-tab-${activeTab}`}
          style={{
            padding: `0 ${pxToRem(metrics.listPaddingX)} ${pxToRem(metrics.listPaddingBottom)}`,
          }}
        >
          {activeTab === "all" ? (
            loading ? (
              <div className="flex flex-col" data-testid="friends-skeleton">
                {Array.from({ length: skeletonRows }, (_unused, index) => (
                  <div
                    className="flex items-center"
                    key={index}
                    style={{
                      gap: pxToRem(metrics.rowGap),
                      padding: `${pxToRem(metrics.rowPaddingY)} ${pxToRem(metrics.rowPaddingX)}`,
                    }}
                  >
                    <Skeleton
                      className="shrink-0 rounded-full"
                      style={{
                        height: pxToRem(metrics.rowAvatarSize),
                        width: pxToRem(metrics.rowAvatarSize),
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <Skeleton
                        style={{ height: pxToRem(metrics.rowNameFontSize), width: "40%" }}
                      />
                      <Skeleton
                        style={{
                          height: pxToRem(metrics.rowStatusFontSize),
                          marginTop: pxToRem(metrics.rowStatusMarginTop),
                          width: "62%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleRows.length === 0 ? (
              <EmptyLine testId="friends-empty">
                {query.trim().length > 0
                  ? t("messages.friends.searchEmpty")
                  : t("messages.friends.empty")}
              </EmptyLine>
            ) : (
              <>
                {sections.online.length > 0 ? (
                  <>
                    <SectionHeading
                      count={sections.online.length}
                      countTone="success"
                      label={t("messages.friends.section.online")}
                    />
                    {sections.online.map((row) => (
                      <FriendRow
                        friend={row}
                        key={row.id}
                        menuOpen={rowMenu?.friendId === row.id}
                        onMessage={(id) => openDirectMessageMutation.mutate(id)}
                        onOpenMenu={(id, anchor) =>
                          setRowMenu({ friendId: id, x: anchor.x, y: anchor.y })
                        }
                        onVideoCall={(id) =>
                          router.push(`${MESSAGES_FRIENDS_ROUTE}?dmCall=${id}&video=1`)
                        }
                        onVoiceCall={(id) => router.push(`${MESSAGES_FRIENDS_ROUTE}?dmCall=${id}`)}
                      />
                    ))}
                  </>
                ) : null}

                {sections.offline.length > 0 ? (
                  <>
                    <SectionHeading
                      count={sections.offline.length}
                      label={t("messages.friends.section.offline")}
                    />
                    {sections.offline.map((row) => (
                      <FriendRow
                        friend={row}
                        key={row.id}
                        menuOpen={rowMenu?.friendId === row.id}
                        onMessage={(id) => openDirectMessageMutation.mutate(id)}
                        onOpenMenu={(id, anchor) =>
                          setRowMenu({ friendId: id, x: anchor.x, y: anchor.y })
                        }
                      />
                    ))}
                  </>
                ) : null}
              </>
            )
          ) : null}

          {activeTab === "add" ? (
            <div style={{ paddingTop: pxToRem(metrics.sectionPaddingTop) }}>
              <div
                className="bg-[hsl(var(--surface-card))]"
                data-testid="friends-add-card"
                style={{
                  border: `${hairline()} solid hsl(var(--border)/0.6)`,
                  borderRadius: pxToRem(metrics.addCardRadius),
                  padding: pxToRem(metrics.addCardPadding),
                }}
              >
                <h2
                  className={cn("text-[hsl(var(--foreground))]", DISPLAY_FONT)}
                  style={{ fontSize: pxToRem(metrics.addCardTitleFontSize), fontWeight: 600 }}
                >
                  {t("messages.friends.add.title")}
                </h2>
                <p
                  className="text-[hsl(var(--text-secondary))]"
                  style={{
                    fontSize: pxToRem(metrics.addCardBodyFontSize),
                    lineHeight: metrics.addCardBodyLineHeight,
                    marginTop: pxToRem(metrics.addCardBodyMarginTop),
                  }}
                >
                  {t("messages.friends.add.description")}
                </p>
                <form
                  className="flex"
                  onSubmit={(event) => {
                    event.preventDefault();

                    if (canSendRequest && !sendRequestMutation.isPending) {
                      sendRequestMutation.mutate(normalizedUsername);
                    }
                  }}
                  style={{
                    gap: pxToRem(metrics.addCardFieldGap),
                    marginTop: pxToRem(metrics.addCardFieldMarginTop),
                  }}
                >
                  <input
                    className="min-w-0 flex-1 bg-[hsl(var(--surface-soft)/0.7)] text-[hsl(var(--foreground))] outline-hidden placeholder:text-[hsl(var(--text-muted))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    data-testid="friends-add-input"
                    onChange={(event) => handleUsernameChange(event.target.value)}
                    placeholder={t("messages.friends.add.placeholder")}
                    style={{
                      border: `${hairline()} solid hsl(var(--border)/0.6)`,
                      borderRadius: pxToRem(metrics.addCardInputRadius),
                      fontSize: pxToRem(metrics.addCardInputFontSize),
                      height: pxToRem(metrics.addCardInputHeight),
                      padding: `0 ${pxToRem(metrics.addCardInputPaddingX)}`,
                    }}
                    value={username}
                  />
                  <button
                    className="shrink-0 bg-[hsl(var(--primary))] text-white transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-55"
                    data-testid="friends-add-submit"
                    disabled={!canSendRequest || sendRequestMutation.isPending}
                    style={{
                      borderRadius: pxToRem(metrics.addCardSubmitRadius),
                      fontSize: pxToRem(metrics.addCardSubmitFontSize),
                      fontWeight: 600,
                      height: pxToRem(metrics.addCardSubmitHeight),
                      padding: `0 ${pxToRem(metrics.addCardSubmitPaddingX)}`,
                    }}
                    type="submit"
                  >
                    {t("messages.friends.add.submit")}
                  </button>
                </form>
                {feedback ? (
                  <p
                    className={cn(
                      "mt-2",
                      feedback.tone === "error"
                        ? "text-[hsl(var(--danger))]"
                        : "text-[hsl(var(--success))]",
                    )}
                    data-testid="friends-add-feedback"
                    role="status"
                    style={{ fontSize: pxToRem(metrics.rowStatusFontSize) }}
                  >
                    {feedback.message}
                  </p>
                ) : null}
              </div>

              <SectionHeading
                count={visibleSuggestions.length}
                label={t("messages.friends.suggestions.title")}
              />

              {visibleSuggestions.length === 0 ? (
                <EmptyLine testId="friends-suggestions-empty">
                  {normalizedQuery.length > 0
                    ? t("messages.friends.searchEmpty")
                    : t("messages.friends.suggestions.empty")}
                </EmptyLine>
              ) : (
                visibleSuggestions.map((suggestion) => (
                  <CompactRow
                    action={
                      sentSuggestionIds.has(suggestion.id) ? (
                        <span
                          className="text-[hsl(var(--text-muted))]"
                          data-testid="friends-suggestion-sent"
                          style={{ fontSize: pxToRem(metrics.compactActionFontSize) }}
                        >
                          {t("messages.friends.suggestions.sent")}
                        </span>
                      ) : (
                        <CompactButton
                          onClick={() => {
                            // İyimser: satır anında "gönderildi" olur, hata
                            // dönerse geri alınır ve nedeni gösterilir.
                            setSentSuggestionIds((current) => new Set(current).add(suggestion.id));
                            sendRequestMutation.mutate(suggestion.username, {
                              onError: () =>
                                setSentSuggestionIds((current) => {
                                  const next = new Set(current);
                                  next.delete(suggestion.id);
                                  return next;
                                }),
                            });
                          }}
                          testId="friends-suggestion-add"
                          tone="tint"
                        >
                          {t("messages.friends.suggestions.action")}
                        </CompactButton>
                      )
                    }
                    avatarUrl={suggestion.avatarUrl}
                    key={suggestion.id}
                    meta={t("messages.friends.suggestions.meta", {
                      count: suggestion.mutualFriendCount,
                      server: suggestion.viaServerName,
                    })}
                    name={suggestion.name}
                    testId="friends-suggestion-row"
                  />
                ))
              )}
            </div>
          ) : null}

          {activeTab === "pending" ? (
            <div style={{ paddingTop: pxToRem(metrics.sectionPaddingTop) }}>
              <SectionHeading
                count={visibleIncoming.length}
                label={t("messages.friends.pending.incoming")}
              />
              {visibleIncoming.length === 0 ? (
                <EmptyLine testId="friends-pending-empty">
                  {normalizedQuery.length > 0
                    ? t("messages.friends.searchEmpty")
                    : t("messages.friends.pending.empty")}
                </EmptyLine>
              ) : (
                visibleIncoming.map((request) => (
                  <CompactRow
                    action={
                      <>
                        <CompactButton
                          onClick={() =>
                            requestActionMutation.mutate({
                              action: "accept",
                              requestId: request.id,
                            })
                          }
                          testId="friends-request-accept"
                          tone="primary"
                        >
                          {t("messages.friends.pending.accept")}
                        </CompactButton>
                        <CompactButton
                          onClick={() =>
                            requestActionMutation.mutate({
                              action: "decline",
                              requestId: request.id,
                            })
                          }
                          testId="friends-request-decline"
                        >
                          {t("messages.friends.pending.ignore")}
                        </CompactButton>
                      </>
                    }
                    avatarUrl={request.sender.avatarUrl}
                    key={request.id}
                    meta={`@${request.sender.username}`}
                    name={request.sender.displayName ?? request.sender.username}
                    testId="friends-incoming-row"
                  />
                ))
              )}

              <SectionHeading
                count={visibleOutgoing.length}
                label={t("messages.friends.pending.outgoing")}
              />
              {visibleOutgoing.map((request) => (
                <CompactRow
                  action={
                    <CompactButton
                      onClick={() => cancelRequestMutation.mutate(request.id)}
                      testId="friends-request-cancel"
                      tone="danger"
                    >
                      {t("messages.friends.pending.cancel")}
                    </CompactButton>
                  }
                  avatarUrl={request.receiver.avatarUrl}
                  dimmed={metrics.rowOfflineAvatarOpacity}
                  key={request.id}
                  meta={`@${request.receiver.username}`}
                  name={request.receiver.displayName ?? request.receiver.username}
                  testId="friends-outgoing-row"
                />
              ))}
            </div>
          ) : null}

          {activeTab === "blocked" ? (
            <div style={{ paddingTop: pxToRem(metrics.sectionPaddingTop) }}>
              <SectionHeading
                count={visibleBlockedUsers.length}
                label={t("messages.friends.blocked.title")}
              />
              {visibleBlockedUsers.length === 0 ? (
                <EmptyLine testId="friends-blocked-empty">
                  {normalizedQuery.length > 0
                    ? t("messages.friends.searchEmpty")
                    : t("messages.friends.blocked.empty")}
                </EmptyLine>
              ) : (
                visibleBlockedUsers.map((blocked) => (
                  <CompactRow
                    action={
                      <CompactButton
                        onClick={() => unblockFriendMutation.mutate(blocked.id)}
                        testId="friends-unblock"
                      >
                        {t("messages.friends.blocked.unblock")}
                      </CompactButton>
                    }
                    avatarUrl={blocked.avatarUrl}
                    dimmed={metrics.blockedAvatarOpacity}
                    key={blocked.id}
                    meta={`@${blocked.username}`}
                    name={blocked.displayName ?? blocked.username}
                    testId="friends-blocked-row"
                  />
                ))
              )}

              <p
                className="text-[hsl(var(--text-muted))]"
                data-testid="friends-blocked-notice"
                style={{
                  background: "hsl(var(--surface-soft)/0.6)",
                  border: `${hairline()} solid hsl(var(--border)/0.5)`,
                  borderRadius: pxToRem(metrics.noticeRadius),
                  fontSize: pxToRem(metrics.noticeFontSize),
                  lineHeight: metrics.noticeLineHeight,
                  marginTop: pxToRem(metrics.noticeMarginTop),
                  padding: `${pxToRem(metrics.noticePaddingY)} ${pxToRem(metrics.noticePaddingX)}`,
                }}
              >
                {t("messages.friends.blocked.notice")}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {menuFriend && rowMenu ? (
        <FriendRowMenu
          friendId={menuFriend.id}
          friendName={menuFriend.name}
          invitableServers={invitableServers}
          onBlock={(id) => {
            const friend = rows.find((row) => row.id === id)?.source;

            if (friend) {
              setConfirmState({ friend, type: "block" });
            }
          }}
          onClose={() => setRowMenu(null)}
          onInviteToServer={(friendId, serverId) => {
            const friend = rows.find((row) => row.id === friendId)?.source;

            if (friend) {
              inviteToServerMutation.mutate({ serverId, username: friend.username });
            }
          }}
          onMute={() => undefined}
          onRemove={(id) => {
            const friend = rows.find((row) => row.id === id)?.source;

            if (friend) {
              setConfirmState({ friend, type: "remove" });
            }
          }}
          onViewProfile={(id) => router.push(`${MESSAGES_FRIENDS_ROUTE}?profile=${id}`)}
          open={true}
          position={{ x: rowMenu.x, y: rowMenu.y }}
        />
      ) : null}

      <GroupCreateDialog
        friends={friends}
        isSubmitting={createGroupMutation.isPending}
        onClose={() =>
          router.replace(clearMessagesActionHref(searchParams.toString()), { scroll: false })
        }
        onSubmit={(input) => createGroupMutation.mutate(input)}
        open={groupDialogOpen}
      />

      <Modal
        closeLabel={t("common.cancel")}
        onClose={() => setConfirmState(null)}
        open={confirmState !== null}
        title={
          confirmState?.type === "block"
            ? t("messages.friends.menu.block")
            : t("messages.friends.menu.remove")
        }
      >
        {confirmState ? (
          <div className="flex flex-col gap-4">
            <p className="text-[hsl(var(--text-secondary))]">
              {confirmState.friend.displayName ?? confirmState.friend.username}
            </p>
            <div className="flex justify-end gap-2">
              <CompactButton onClick={() => setConfirmState(null)} testId="friends-confirm-cancel">
                {t("common.cancel")}
              </CompactButton>
              <CompactButton
                onClick={() => {
                  if (confirmState.type === "block") {
                    blockFriendMutation.mutate(confirmState.friend.id);
                    return;
                  }

                  removeFriendMutation.mutate(confirmState.friend);
                }}
                testId="friends-confirm-submit"
                tone="danger"
              >
                {confirmState.type === "block"
                  ? t("messages.friends.menu.block")
                  : t("messages.friends.menu.remove")}
              </CompactButton>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function Chip({
  dotClass,
  label,
  testId,
  toneClass,
}: {
  dotClass: string;
  label: string;
  testId: string;
  toneClass: string;
}) {
  return (
    <span
      className={cn("flex shrink-0 items-center", toneClass)}
      data-testid={testId}
      style={{
        borderRadius: pxToRem(metrics.chipRadius),
        fontSize: pxToRem(metrics.chipFontSize),
        fontWeight: 600,
        gap: pxToRem(metrics.chipGap),
        padding: `${pxToRem(metrics.chipPaddingY)} ${pxToRem(metrics.chipPaddingX)}`,
      }}
    >
      <span
        aria-hidden="true"
        className={cn("shrink-0 rounded-full", dotClass)}
        style={{ height: pxToRem(metrics.chipDotSize), width: pxToRem(metrics.chipDotSize) }}
      />
      {label}
    </span>
  );
}
