"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { BadgeCheck, Compass, Search } from "lucide-react";
import {
  formatServerProfileCount,
  type ServerDiscoveryCard,
  type ServerDiscoveryPage,
} from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { ServerDiscoveryGridSkeleton } from "@/components/shell/shell-skeletons";
import {
  FALLBACK_BANNER_STYLE,
  FALLBACK_ICON_STYLE,
} from "@/components/servers/server-profile-card";
import {
  fetchServerDiscoveryPage,
  serverDiscoveryQueryKeys,
  type ServerDiscoveryPageParams,
} from "@/lib/servers/client";

const SEARCH_DEBOUNCE_MS = 500;

function DiscoveryCard({ server }: { server: ServerDiscoveryCard }) {
  const { locale, t } = useI18n();

  return (
    <Link
      className="app-panel block overflow-hidden rounded-[24px] border transition hover:border-[hsl(var(--primary)/0.36)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      data-testid={`server-discovery-card-${server.id}`}
      href={`/servers/${encodeURIComponent(server.id)}/about`}
    >
      <div
        className="relative h-20 w-full"
        style={server.bannerUrl ? undefined : FALLBACK_BANNER_STYLE}
      >
        {server.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="h-full w-full object-cover" src={server.bannerUrl} />
        ) : null}
      </div>
      <div className="-mt-6 px-4 pb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border-[3px] border-[hsl(var(--surface-card))] bg-[hsl(var(--surface-card))] shadow-[0_6px_16px_rgba(30,34,53,0.14)]">
          {server.iconUrl ? (
            <Avatar
              alt={server.name}
              className="h-[42px] w-[42px] rounded-[12px]"
              fallback={server.name}
              src={server.iconUrl}
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-[42px] w-[42px] rounded-[12px]"
              style={FALLBACK_ICON_STYLE}
            />
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-app-foreground">
            {server.name}
          </h3>
          {server.verified ? (
            <BadgeCheck
              aria-hidden="true"
              className="h-[14px] w-[14px] shrink-0 text-[hsl(var(--primary))]"
            />
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-emerald-400" />
            <span className="text-[11px] font-semibold text-app-muted">
              {formatServerProfileCount(server.onlineCount, locale)} {t("discover.online")}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-slate-300" />
            <span className="text-[11px] font-semibold text-app-muted">
              {formatServerProfileCount(server.memberCount, locale)} {t("discover.members")}
            </span>
          </span>
        </div>

        {server.description ? (
          <p className="mt-2 line-clamp-2 text-[12px] font-medium leading-[1.5] text-app-muted">
            {server.description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function ServerDiscoveryScreen() {
  const { t } = useI18n();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const trimmedQuery = debouncedQuery.trim();

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [],
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
      debounceRef.current = null;
    }, SEARCH_DEBOUNCE_MS);
  };

  const discoveryQuery = useInfiniteQuery<
    ServerDiscoveryPage,
    Error,
    InfiniteData<ServerDiscoveryPage, string | undefined>,
    ReturnType<typeof serverDiscoveryQueryKeys.list>,
    string | undefined
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => {
      const params: ServerDiscoveryPageParams = {};
      if (pageParam) {
        params.cursor = pageParam;
      }
      if (trimmedQuery) {
        params.query = trimmedQuery;
      }
      return fetchServerDiscoveryPage(params);
    },
    queryKey: serverDiscoveryQueryKeys.list(trimmedQuery),
  });

  const servers = discoveryQuery.data?.pages.flatMap((page) => page.servers) ?? [];
  const hasNextPage = discoveryQuery.hasNextPage ?? false;
  const { fetchNextPage, isFetchingNextPage } = discoveryQuery;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="h-full w-full overflow-y-auto px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-app-foreground text-2xl font-semibold tracking-tight md:text-3xl">
            {t("discover.title")}
          </h1>
          <p className="text-app-muted mt-2 text-sm">{t("discover.subtitle")}</p>
        </div>

        <label className="relative mb-6 block max-w-md" data-testid="server-discovery-search">
          <span className="sr-only">{t("discover.searchLabel")}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-app-soft" />
          <input
            className="h-12 w-full rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.9)] pl-10 pr-4 text-sm font-medium text-app-foreground shadow-[0_14px_34px_hsl(var(--shadow-color)/0.08)] outline-hidden transition placeholder:text-app-soft focus:border-[hsl(var(--primary)/0.42)] focus:ring-2 focus:ring-[hsl(var(--ring)/0.5)]"
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={t("discover.searchPlaceholder")}
            type="search"
            value={searchInput}
          />
        </label>

        {discoveryQuery.isPending ? <ServerDiscoveryGridSkeleton /> : null}

        {discoveryQuery.isError ? (
          <div
            className="app-panel-soft mx-auto mt-8 w-full max-w-[420px] rounded-[24px] border p-6 text-center"
            data-testid="server-discovery-error"
          >
            <p className="text-sm font-semibold text-app-foreground">{t("errors.genericTitle")}</p>
            <p className="mt-2 text-xs leading-5 text-app-muted">
              {t("errors.genericDescription")}
            </p>
            <button
              className="mt-4 inline-flex items-center justify-center rounded-2xl bg-[hsl(var(--primary))] px-4 py-2 text-xs font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90"
              onClick={() => void discoveryQuery.refetch()}
              type="button"
            >
              {t("errors.retry")}
            </button>
          </div>
        ) : null}

        {discoveryQuery.isSuccess && servers.length === 0 ? (
          <div
            className="rounded-[24px] border border-dashed border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.28)] px-6 py-12 text-center"
            data-testid={trimmedQuery ? "server-discovery-empty-search" : "server-discovery-empty"}
          >
            <Compass aria-hidden="true" className="mx-auto h-8 w-8 text-app-soft" />
            <p className="mt-3 text-sm font-semibold text-app-foreground">
              {trimmedQuery ? t("discover.emptySearch.title") : t("discover.emptyState.title")}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-app-muted">
              {trimmedQuery
                ? t("discover.emptySearch.description", { query: trimmedQuery })
                : t("discover.emptyState.description")}
            </p>
          </div>
        ) : null}

        {servers.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => (
              <DiscoveryCard key={server.id} server={server} />
            ))}
          </div>
        ) : null}

        <div aria-hidden="true" className="h-px" ref={sentinelRef} />

        {discoveryQuery.isFetchingNextPage ? (
          <p aria-live="polite" className="mt-4 text-center text-xs font-semibold text-app-soft">
            {t("discover.loadingMore")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
