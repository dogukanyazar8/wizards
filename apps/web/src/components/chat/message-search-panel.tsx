"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, X } from "lucide-react";
import type { MessageSearchResult } from "@wizards/types";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { searchMessages } from "@/lib/messages/search-client";
import type { MessageMode } from "@/hooks/use-messages";

type MessageSearchPanelProps = {
  anchorRef: RefObject<HTMLElement | null>;
  conversationId: string;
  mode: MessageMode;
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
};

type SearchMode = "basic" | "advanced";
type SearchPanelPosition = {
  left: number;
  top: number;
  width: number;
};
const subscribeToHydration = () => () => {};

function getSearchPanelPosition(anchor: HTMLElement | null): SearchPanelPosition | null {
  if (!anchor || typeof window === "undefined") {
    return null;
  }

  const rect = anchor.getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const width = Math.min(320, window.innerWidth - margin * 2);
  const left = Math.min(Math.max(rect.right - width, margin), window.innerWidth - width - margin);
  const top = Math.min(rect.bottom + gap, window.innerHeight - margin);

  return { left, top, width };
}

function getResultPreview(result: MessageSearchResult, fallback: string) {
  const normalized = result.content.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return fallback;
  }

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function toIsoDateTime(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function MessageSearchPanel({
  anchorRef,
  conversationId,
  mode,
  onClose,
  onJumpToMessage,
}: MessageSearchPanelProps) {
  const { locale, t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isMounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [position, setPosition] = useState<SearchPanelPosition | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("basic");
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exact, setExact] = useState(false);
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedQuery = query.trim();
  const normalizedAuthor = author.trim();
  const fromIso = useMemo(() => toIsoDateTime(fromDate), [fromDate]);
  const toIso = useMemo(() => toIsoDateTime(toDate), [toDate]);
  const canSearch = normalizedQuery.length >= 2;
  const visibleResults = canSearch ? results : [];
  const visibleNextCursor = canSearch ? nextCursor : null;
  const visibleError = canSearch ? error : null;
  const visibleIsLoading = canSearch && isLoading;

  const updatePosition = useCallback(() => {
    setPosition(getSearchPanelPosition(anchorRef.current));
  }, [anchorRef]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      }),
    [locale],
  );

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!canSearch) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      searchMessages({
        author: searchMode === "advanced" ? normalizedAuthor : null,
        conversationId,
        exact: searchMode === "advanced" ? exact : false,
        from: searchMode === "advanced" ? fromIso : null,
        mode,
        query: normalizedQuery,
        to: searchMode === "advanced" ? toIso : null,
      })
        .then((response) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults(response.results);
          setNextCursor(response.nextCursor);
        })
        .catch((searchError) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults([]);
          setNextCursor(null);
          setError(searchError instanceof Error ? searchError.message : t("chat.search.error"));
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    canSearch,
    conversationId,
    exact,
    fromIso,
    mode,
    normalizedAuthor,
    normalizedQuery,
    searchMode,
    t,
    toIso,
  ]);

  const loadMore = () => {
    if (!nextCursor || isLoadingMore || !canSearch) {
      return;
    }

    setIsLoadingMore(true);
    setError(null);
    searchMessages({
      author: searchMode === "advanced" ? normalizedAuthor : null,
      conversationId,
      cursor: nextCursor,
      exact: searchMode === "advanced" ? exact : false,
      from: searchMode === "advanced" ? fromIso : null,
      mode,
      query: normalizedQuery,
      to: searchMode === "advanced" ? toIso : null,
    })
      .then((response) => {
        setResults((current) => [...current, ...response.results]);
        setNextCursor(response.nextCursor);
      })
      .catch((searchError) => {
        setError(searchError instanceof Error ? searchError.message : t("chat.search.error"));
      })
      .finally(() => setIsLoadingMore(false));
  };

  if (!isMounted || !position || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000]" onPointerDown={onClose} role="presentation">
      <div
        ref={panelRef}
        className="app-panel fixed max-h-[min(34rem,calc(100dvh-1.5rem))] overflow-y-auto rounded-[26px] border bg-[hsl(var(--surface-card))] p-3 shadow-[0_28px_70px_hsl(var(--shadow-color)/0.2)] backdrop-blur-xl"
        data-testid="message-search-panel"
        aria-labelledby={titleId}
        aria-modal="true"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
        style={{
          left: position.left,
          maxHeight: `calc(100dvh - ${position.top + 12}px)`,
          top: position.top,
          width: position.width,
        }}
      >
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-app-soft">
              {t("chat.search.eyebrow")}
            </p>
            <p className="truncate text-sm font-semibold text-app-foreground" id={titleId}>
              {t("chat.search.title")}
            </p>
          </div>
          <button
            aria-label={t("common.close")}
            className="rounded-full p-2 text-app-muted transition hover:bg-app-surface-soft hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.48)] p-1">
          {(["basic", "advanced"] as const).map((modeKey) => (
            <button
              className={`rounded-xl px-3 py-2 text-xs font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] ${
                searchMode === modeKey
                  ? "bg-[hsl(var(--surface-card))] text-app-foreground shadow-[0_10px_24px_hsl(var(--shadow-color)/0.1)]"
                  : "text-app-muted hover:bg-app-surface-soft hover:text-app-foreground"
              }`}
              key={modeKey}
              onClick={() => setSearchMode(modeKey)}
              type="button"
            >
              {t(`chat.search.${modeKey}`)}
            </button>
          ))}
        </div>

        <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.5)] px-3">
          <Search className="h-4 w-4 shrink-0 text-app-soft" />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-app-foreground outline-hidden placeholder:text-app-soft"
            data-testid="message-search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("chat.search.placeholder")}
            value={query}
          />
        </label>

        {searchMode === "advanced" ? (
          <div className="mt-3 space-y-2 rounded-[22px] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.34)] p-3">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-app-soft">
                {t("chat.search.author")}
              </span>
              <input
                className="h-10 w-full rounded-2xl border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card))] px-3 text-xs font-semibold text-app-foreground outline-hidden placeholder:text-app-soft focus:border-[hsl(var(--ring)/0.62)] focus:ring-2 focus:ring-[hsl(var(--ring)/0.18)]"
                onChange={(event) => setAuthor(event.target.value)}
                placeholder={t("chat.search.authorPlaceholder")}
                value={author}
              />
            </label>
            <div className="grid gap-2">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-app-soft">
                  {t("chat.search.from")}
                </span>
                <input
                  className="h-10 w-full rounded-2xl border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card))] px-3 text-xs font-semibold text-app-foreground outline-hidden focus:border-[hsl(var(--ring)/0.62)] focus:ring-2 focus:ring-[hsl(var(--ring)/0.18)]"
                  onChange={(event) => setFromDate(event.target.value)}
                  type="datetime-local"
                  value={fromDate}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-app-soft">
                  {t("chat.search.to")}
                </span>
                <input
                  className="h-10 w-full rounded-2xl border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card))] px-3 text-xs font-semibold text-app-foreground outline-hidden focus:border-[hsl(var(--ring)/0.62)] focus:ring-2 focus:ring-[hsl(var(--ring)/0.18)]"
                  onChange={(event) => setToDate(event.target.value)}
                  type="datetime-local"
                  value={toDate}
                />
              </label>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-card))] px-3 py-2.5">
              <input
                checked={exact}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                onChange={(event) => setExact(event.target.checked)}
                type="checkbox"
              />
              <span className="text-xs font-semibold text-app-foreground">
                {t("chat.search.exact")}
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-3 max-h-[52dvh] overflow-y-auto pr-1">
          {!canSearch ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.26)] px-4 py-6 text-center text-sm text-app-muted">
              {t("chat.search.minLength")}
            </div>
          ) : null}

          {visibleIsLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl px-4 py-8 text-sm text-app-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("chat.search.loading")}
            </div>
          ) : null}

          {visibleError ? (
            <div className="rounded-2xl border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] px-4 py-3 text-sm font-medium text-[hsl(var(--danger))]">
              {visibleError}
            </div>
          ) : null}

          {canSearch && !visibleIsLoading && !visibleError && visibleResults.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.26)] px-4 py-6 text-center text-sm text-app-muted">
              {t("chat.search.empty")}
            </div>
          ) : null}

          <div className="space-y-1">
            {visibleResults.map((result) => (
              <button
                className="group flex w-full min-w-0 items-start gap-3 rounded-[22px] px-3 py-2.5 text-left transition hover:bg-app-surface-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
                key={result.id}
                onClick={() => {
                  onJumpToMessage(result.messageId);
                  onClose();
                }}
                type="button"
              >
                <Avatar
                  alt={result.author.displayName}
                  className="mt-0.5 h-9 w-9 text-xs"
                  fallback={result.author.displayName}
                  src={result.author.avatarUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-bold text-app-foreground">
                      {result.author.displayName}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-soft">
                      {formatter.format(new Date(result.createdAt))}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted group-hover:text-app-foreground">
                    {getResultPreview(result, t("chat.search.attachmentOnly"))}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {visibleNextCursor ? (
          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.45)] px-4 py-2.5 text-sm font-bold text-app-foreground transition hover:bg-app-surface-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)] disabled:cursor-wait disabled:opacity-70"
            disabled={isLoadingMore}
            onClick={loadMore}
            type="button"
          >
            {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("chat.search.loadMore")}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
