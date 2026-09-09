"use client";

import React, {
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
import { Loader2, Search } from "lucide-react";
import type { MessageSearchResult } from "@wizards/types";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { ServerToggleSwitch } from "@/components/servers/shared/toggle-row";
import { SettingSelect } from "@/components/settings/rows/setting-select";
import { DISPLAY_FONT, DISPLAY_TRACKING } from "@/components/servers/shared/typography";
import {
  EMPTY_MESSAGE_SEARCH_FORM,
  MESSAGE_SEARCH_CONTENT_TAGS,
  MESSAGE_SEARCH_DATE_RANGES,
  buildHighlightSegments,
  buildMessageSearchFilters,
  collectUnsupportedFilters,
  isMessageSearchFiltered,
  toggleContentTag,
  type MessageSearchContentTag,
  type MessageSearchDateRange,
  type MessageSearchFormState,
} from "@/lib/messages/search-filters";
import { searchMessages } from "@/lib/messages/search-client";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";
import { createRafThrottledCallback } from "@/lib/ui/raf-throttle";
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

/**
 * İki arama yüzeyinin ortak getirme katmanı: DM'in açılır penceresi ve SPEC-SUNUCU §4.3'ün
 * sağ paneli. `request` `null` iken hiçbir istek atılmaz ve dönen sonuç kümesi boş görünür —
 * sorgu iki karakterin altına düştüğünde ekranda bayat bir liste kalmasın diye.
 *
 * `runToken` yalnız §4.3'ün `Aramayı çalıştır` düğmesi için var: değeri artınca aynı
 * parametrelerle yeni bir arama koşar. Canlı arama (220 ms gecikme) korunur; düğme onu
 * beklemeden tetikler.
 */
type MessageSearchRequest = {
  author: string | null;
  conversationId: string;
  exact: boolean;
  from: string | null;
  mode: MessageMode;
  query: string;
  runToken: number;
  to: string | null;
};

const EMPTY_RESULTS: MessageSearchResult[] = [];

function useMessageSearchResults(request: MessageSearchRequest | null) {
  const { t } = useI18n();
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const author = request?.author ?? null;
  const conversationId = request?.conversationId ?? null;
  const exact = request?.exact ?? false;
  const from = request?.from ?? null;
  const mode = request?.mode ?? null;
  const query = request?.query ?? null;
  const runToken = request?.runToken ?? 0;
  const to = request?.to ?? null;

  useEffect(() => {
    if (conversationId === null || mode === null || query === null) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      searchMessages({ author, conversationId, exact, from, mode, query, to })
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
  }, [author, conversationId, exact, from, mode, query, runToken, t, to]);

  const loadMore = useCallback(() => {
    if (!request || !nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setError(null);
    searchMessages({
      author: request.author,
      conversationId: request.conversationId,
      cursor: nextCursor,
      exact: request.exact,
      from: request.from,
      mode: request.mode,
      query: request.query,
      to: request.to,
    })
      .then((response) => {
        setResults((current) => [...current, ...response.results]);
        setNextCursor(response.nextCursor);
      })
      .catch((searchError) => {
        setError(searchError instanceof Error ? searchError.message : t("chat.search.error"));
      })
      .finally(() => setIsLoadingMore(false));
  }, [isLoadingMore, nextCursor, request, t]);

  // Boşta iken sonuç **maskelenir**, silinmez: silmek efekt gövdesinde bir `setState` demek
  // olurdu (cascading render) ve kullanıcı sorgunun son harfini silip geri yazdığında liste
  // bir kare boyunca boş görünürdü.
  const idle = request === null;

  return {
    error: idle ? null : error,
    isLoading: idle ? false : isLoading,
    isLoadingMore: idle ? false : isLoadingMore,
    loadMore,
    nextCursor: idle ? null : nextCursor,
    results: idle ? EMPTY_RESULTS : results,
  };
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
  const normalizedQuery = query.trim();
  const normalizedAuthor = author.trim();
  const fromIso = useMemo(() => toIsoDateTime(fromDate), [fromDate]);
  const toIso = useMemo(() => toIsoDateTime(toDate), [toDate]);
  const canSearch = normalizedQuery.length >= 2;
  const request = useMemo<MessageSearchRequest | null>(
    () =>
      canSearch
        ? {
            author: searchMode === "advanced" ? normalizedAuthor || null : null,
            conversationId,
            exact: searchMode === "advanced" ? exact : false,
            from: searchMode === "advanced" ? fromIso : null,
            mode,
            query: normalizedQuery,
            runToken: 0,
            to: searchMode === "advanced" ? toIso : null,
          }
        : null,
    [
      canSearch,
      conversationId,
      exact,
      fromIso,
      mode,
      normalizedAuthor,
      normalizedQuery,
      searchMode,
      toIso,
    ],
  );
  const { error, isLoading, isLoadingMore, loadMore, nextCursor, results } =
    useMessageSearchResults(request);

  const updatePosition = useCallback(() => {
    const nextPosition = getSearchPanelPosition(anchorRef.current);
    setPosition((currentPosition) =>
      currentPosition?.left === nextPosition?.left &&
      currentPosition?.top === nextPosition?.top &&
      currentPosition?.width === nextPosition?.width
        ? currentPosition
        : nextPosition,
    );
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
    // Nested message-list scrolls reach this capture listener. Measure at most
    // once per frame and keep state stable when the anchor did not move.
    const throttledScroll = createRafThrottledCallback(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", throttledScroll.run, true);
    return () => {
      throttledScroll.cancel();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", throttledScroll.run, true);
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

  if (!isMounted || !position || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000]" onPointerDown={onClose} role="presentation">
      <div
        ref={panelRef}
        className="app-panel fixed max-h-[min(34rem,calc(100dvh-1.5rem))] overflow-y-auto rounded-[1.625rem] border bg-[hsl(var(--surface-card))] p-3 shadow-[0_28px_70px_hsl(var(--shadow-color)/0.2)] backdrop-blur-xl"
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
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-app-soft">
              {t("chat.search.eyebrow")}
            </p>
            <p className="truncate text-sm font-semibold text-app-foreground" id={titleId}>
              {t("chat.search.title")}
            </p>
          </div>
          <WindowCloseButton aria-label={t("common.close")} onClick={onClose} />
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
          <div className="mt-3 space-y-2 rounded-[1.375rem] border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.34)] p-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-[0.16em] text-app-soft">
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
                <span className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-[0.16em] text-app-soft">
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
                <span className="mb-1.5 block text-[0.625rem] font-bold uppercase tracking-[0.16em] text-app-soft">
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

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl px-4 py-8 text-sm text-app-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("chat.search.loading")}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] px-4 py-3 text-sm font-medium text-[hsl(var(--danger))]">
              {error}
            </div>
          ) : null}

          {canSearch && !isLoading && !error && results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.26)] px-4 py-6 text-center text-sm text-app-muted">
              {t("chat.search.empty")}
            </div>
          ) : null}

          <div className="space-y-1">
            {results.map((result) => (
              <button
                className="group flex w-full min-w-0 items-start gap-3 rounded-[1.375rem] px-3 py-2.5 text-left transition hover:bg-app-surface-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.45)]"
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
                    <span className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-app-soft">
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

        {nextCursor ? (
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

/* ------------------------------------------------------------------------------------------ */
/* SPEC-SUNUCU §4.3 — sağ panelin arama içeriği                                                */
/* ------------------------------------------------------------------------------------------ */

const SEGMENT_MODES: readonly SearchMode[] = ["basic", "advanced"];

export type ChannelSearchOption = {
  readonly id: string;
  readonly name: string;
};

export type ChannelSearchPanelProps = {
  /** `KANAL` alanının seçenekleri — sunucunun görünür yazı kanalları. */
  readonly channelOptions: readonly ChannelSearchOption[];
  /** Aranan kanal. Değişince uç adresi değişir; uydurma bir `channel` parametresi yoktur. */
  readonly channelId: string;
  /** `KİMDEN` alanının seçenekleri; uca `username` gider. */
  readonly memberOptions: readonly ChannelSearchOption[];
  readonly onChannelChange: (channelId: string) => void;
  readonly onJumpToMessage: (messageId: string) => void;
};

function fieldLabelStyle() {
  const { search } = SERVER_METRICS;

  return {
    color: "hsl(var(--text-muted))",
    font: `600 ${pxToRem(search.fieldLabelFontSize)}/1 ${DISPLAY_FONT}`,
    letterSpacing: `${search.fieldLabelLetterSpacing}em`,
    textTransform: "uppercase",
  } as const;
}

export function SearchSelectField({
  label,
  onChange,
  options,
  testId,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  testId: string;
  value: string;
}) {
  const { search } = SERVER_METRICS;
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div>
      <span id={fieldId} style={fieldLabelStyle()}>
        {label}
      </span>
      <div className="flex justify-end" style={{ marginTop: pxToRem(search.fieldRowMarginTop) }}>
        <SettingSelect
          labelledById={fieldId}
          onChange={(index) => {
            const selected = options[index];
            if (selected) {
              onChange(selected.value);
            }
          }}
          onOpenChange={setOpen}
          open={open}
          options={options.map((option) => ({ label: option.label }))}
          testId={testId}
          value={selectedIndex}
        />
      </div>
    </div>
  );
}

export function ChannelSearchPanel({
  channelOptions,
  channelId,
  memberOptions,
  onChannelChange,
  onJumpToMessage,
}: ChannelSearchPanelProps) {
  const { locale, t } = useI18n();
  const { search } = SERVER_METRICS;
  const [searchMode, setSearchMode] = useState<SearchMode>("basic");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<MessageSearchFormState>(EMPTY_MESSAGE_SEARCH_FORM);
  const [runToken, setRunToken] = useState(0);
  /**
   * Hazır tarih aralığının çıpası. `Date.now()` render sırasında okunsaydı `from` her karede
   * değişir, efektin bağımlılığı hiç sabitlenmez ve arama sonsuz koşardı. Bu yüzden zaman
   * yalnız **kullanıcı** aralığı değiştirdiğinde ya da `Aramayı çalıştır`a bastığında tazelenir.
   */
  const [runStamp, setRunStamp] = useState(() => Date.now());
  const threadSwitchId = useId();
  const normalizedQuery = query.trim();
  const canSearch = normalizedQuery.length >= 2;
  const filters = useMemo(
    () => buildMessageSearchFilters(form, searchMode, runStamp),
    [form, runStamp, searchMode],
  );
  const request = useMemo<MessageSearchRequest | null>(
    () =>
      canSearch
        ? {
            author: filters.author,
            conversationId: channelId,
            exact: filters.exact,
            from: filters.from,
            mode: "channel" as const,
            query: normalizedQuery,
            runToken,
            to: filters.to,
          }
        : null,
    [canSearch, channelId, filters, normalizedQuery, runToken],
  );
  const { error, isLoading, isLoadingMore, loadMore, nextCursor, results } =
    useMessageSearchResults(request);
  const unsupported = collectUnsupportedFilters(form);
  const filtered = isMessageSearchFiltered(form, searchMode);
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
    [locale],
  );

  const patch = (next: Partial<MessageSearchFormState>) => {
    setForm((current) => ({ ...current, ...next }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="server-panel-search">
      <div
        style={{
          display: "flex",
          gap: pxToRem(search.segmentGap),
          padding: `${pxToRem(search.segmentPaddingTop)} ${pxToRem(search.segmentPaddingX)} 0`,
        }}
      >
        {SEGMENT_MODES.map((modeKey) => {
          const active = searchMode === modeKey;

          return (
            <button
              aria-pressed={active}
              className="flex-1 cursor-pointer transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              data-testid={`server-search-mode-${modeKey}`}
              key={modeKey}
              onClick={() => setSearchMode(modeKey)}
              style={{
                background: active
                  ? `hsl(var(--primary)/${search.segmentActiveBackgroundAlpha})`
                  : "hsl(var(--surface-card))",
                border: `${hairline()} solid ${
                  active ? "hsl(var(--primary))" : "hsl(var(--border)/0.7)"
                }`,
                borderRadius: pxToRem(search.segmentButtonRadius),
                color: active ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
                font: `600 ${pxToRem(search.segmentButtonFontSize)}/1 var(--font-sans), sans-serif`,
                padding: `${pxToRem(search.segmentButtonPaddingY)} 0`,
              }}
              type="button"
            >
              {t(`server.search.mode.${modeKey}`)}
            </button>
          );
        })}
      </div>

      <div
        style={{
          padding: `${pxToRem(search.queryPaddingTop)} ${pxToRem(search.queryPaddingX)} 0`,
        }}
      >
        <label
          className="flex items-center"
          style={{
            background: "hsl(var(--surface-card))",
            border: `${hairline()} solid hsl(var(--primary)/${search.queryBoxBorderAlpha})`,
            borderRadius: pxToRem(search.queryBoxRadius),
            gap: pxToRem(search.queryBoxGap),
            padding: `${pxToRem(search.queryBoxPaddingY)} ${pxToRem(search.queryBoxPaddingX)}`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-app-muted"
            style={{
              height: pxToEm(search.queryIconSize, search.queryFontSize),
              width: pxToEm(search.queryIconSize, search.queryFontSize),
            }}
          />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-app-foreground outline-hidden placeholder:text-app-muted"
            data-testid="server-search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("server.search.placeholder")}
            style={{ fontSize: pxToRem(search.queryFontSize) }}
            value={query}
          />
        </label>
      </div>

      {searchMode === "advanced" ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: pxToRem(search.fieldsGap),
            padding: `${pxToRem(search.fieldsPaddingTop)} ${pxToRem(
              search.fieldsPaddingX,
            )} ${pxToRem(search.fieldsPaddingBottom)}`,
          }}
        >
          <SearchSelectField
            label={t("server.search.field.author")}
            onChange={(value) => patch({ author: value })}
            options={[
              { label: t("server.search.field.authorAny"), value: "" },
              ...memberOptions.map((member) => ({ label: member.name, value: member.id })),
            ]}
            testId="server-search-author"
            value={form.author}
          />
          <SearchSelectField
            label={t("server.search.field.channel")}
            onChange={onChannelChange}
            options={channelOptions.map((channel) => ({
              label: `#${channel.name}`,
              value: channel.id,
            }))}
            testId="server-search-channel"
            value={channelId}
          />
          <SearchSelectField
            label={t("server.search.field.dateRange")}
            onChange={(value) => {
              setRunStamp(Date.now());
              patch({ dateRange: value as MessageSearchDateRange });
            }}
            options={MESSAGE_SEARCH_DATE_RANGES.map((range) => ({
              label: t(`server.search.dateRange.${range}`),
              value: range,
            }))}
            testId="server-search-date-range"
            value={form.dateRange}
          />

          <div>
            <span style={fieldLabelStyle()}>{t("server.search.field.contains")}</span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: pxToRem(search.tagChipsGap),
                marginTop: pxToRem(search.tagChipsMarginTop),
              }}
            >
              {MESSAGE_SEARCH_CONTENT_TAGS.map((tag) => {
                const active = form.contentTags.includes(tag);

                return (
                  <button
                    aria-pressed={active}
                    className="cursor-pointer whitespace-nowrap transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    data-testid={`server-search-tag-${tag}`}
                    key={tag}
                    onClick={() =>
                      patch({
                        contentTags: toggleContentTag(
                          form.contentTags,
                          tag as MessageSearchContentTag,
                        ),
                      })
                    }
                    style={{
                      background: active
                        ? `hsl(var(--primary)/${search.segmentActiveBackgroundAlpha})`
                        : "hsl(var(--surface-card))",
                      border: `${hairline()} solid ${
                        active ? "hsl(var(--primary))" : "hsl(var(--border)/0.7)"
                      }`,
                      borderRadius: pxToRem(search.tagChipRadius),
                      color: active ? "hsl(var(--primary))" : "hsl(var(--text-secondary))",
                      font: `600 ${pxToRem(search.tagChipFontSize)}/1 var(--font-sans), sans-serif`,
                      padding: `${pxToRem(search.tagChipPaddingY)} ${pxToRem(
                        search.tagChipPaddingX,
                      )}`,
                    }}
                    type="button"
                  >
                    {t(`server.search.contains.${tag}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="flex items-center"
            style={{
              background: `hsl(var(--surface-soft)/${search.threadRowBackgroundAlpha})`,
              borderRadius: pxToRem(search.threadRowRadius),
              gap: pxToRem(search.threadRowGap),
              padding: `${pxToRem(search.threadRowPaddingY)} ${pxToRem(search.threadRowPaddingX)}`,
            }}
          >
            <span
              className="min-w-0 flex-1"
              id={threadSwitchId}
              style={{
                color: "hsl(var(--text-secondary))",
                font: `500 ${pxToRem(search.threadLabelFontSize)}/${
                  search.threadLabelLineHeight
                } var(--font-sans), sans-serif`,
              }}
            >
              {t("server.search.threadOnly")}
            </span>
            <ServerToggleSwitch
              ariaLabelledBy={threadSwitchId}
              checked={form.threadOnly}
              onChange={(checked) => patch({ threadOnly: checked })}
              size="compact"
              testId="server-search-thread-only"
            />
          </div>

          {unsupported.length > 0 ? (
            <p
              className="text-app-muted"
              data-testid="server-search-unsupported"
              role="status"
              style={{
                font: `500 ${pxToRem(search.threadLabelFontSize)}/${
                  search.threadLabelLineHeight
                } var(--font-sans), sans-serif`,
              }}
            >
              {t("server.search.unsupported")}
            </p>
          ) : null}

          <button
            className="w-full cursor-pointer border-0 transition-[filter] hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="server-search-run"
            onClick={() => {
              setRunStamp(Date.now());
              setRunToken((current) => current + 1);
            }}
            style={{
              background: "hsl(var(--primary))",
              borderRadius: pxToRem(search.runButtonRadius),
              boxShadow: `${pxToRem(search.runButtonShadow.x)} ${pxToRem(
                search.runButtonShadow.y,
              )} ${pxToRem(search.runButtonShadow.blur)} ${pxToRem(
                search.runButtonShadow.spread,
              )} hsl(var(--primary))`,
              color: "hsl(var(--primary-foreground))",
              font: `600 ${pxToRem(search.runButtonFontSize)}/1 var(--font-sans), sans-serif`,
              padding: `${pxToRem(search.runButtonPaddingY)} 0`,
            }}
            type="button"
          >
            {t("server.search.run")}
          </button>
        </div>
      ) : null}

      <div
        className="flex items-center justify-between"
        style={{
          gap: pxToRem(search.resultsHeaderGap),
          padding: `${pxToRem(search.resultsHeaderPaddingTop)} ${pxToRem(
            search.resultsHeaderPaddingX,
          )} ${pxToRem(search.resultsHeaderPaddingBottom)}`,
        }}
      >
        <span
          data-testid="server-search-result-count"
          style={{
            color: "hsl(var(--text-muted))",
            font: `600 ${pxToRem(search.resultsLabelFontSize)}/1 ${DISPLAY_FONT}`,
            letterSpacing: `${search.fieldLabelLetterSpacing}em`,
            textTransform: "uppercase",
          }}
        >
          {filtered
            ? t("server.search.results.filtered", { count: results.length })
            : t("server.search.results.count", { count: results.length })}
        </span>
        <span
          className="shrink-0"
          style={{
            color: "hsl(var(--primary))",
            font: `600 ${pxToRem(search.resultsSortFontSize)}/1 ${DISPLAY_FONT}`,
          }}
        >
          {t("server.search.sort.newest")}
        </span>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: pxToRem(search.resultsListGap),
          padding: `0 ${pxToRem(search.resultsListPaddingX)} ${pxToRem(
            search.resultsListPaddingBottom,
          )}`,
        }}
      >
        {!canSearch ? (
          <p className="text-center text-xs text-app-muted">{t("chat.search.minLength")}</p>
        ) : null}
        {isLoading ? (
          <p className="flex items-center justify-center gap-2 text-xs text-app-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("chat.search.loading")}
          </p>
        ) : null}
        {error ? <p className="text-xs font-medium text-[hsl(var(--danger))]">{error}</p> : null}
        {canSearch && !isLoading && !error && results.length === 0 ? (
          <p className="text-center text-xs text-app-muted">{t("chat.search.empty")}</p>
        ) : null}

        {results.map((result) => (
          <button
            className="w-full cursor-pointer text-left transition-[border-color,transform] hover:-translate-y-px hover:border-[hsl(var(--primary)/0.5)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] motion-reduce:transform-none"
            data-testid="server-search-result"
            key={result.id}
            onClick={() => onJumpToMessage(result.messageId)}
            style={{
              background: "hsl(var(--surface-card))",
              border: `${hairline()} solid hsl(var(--border)/${search.resultBorderAlpha})`,
              borderRadius: pxToRem(search.resultRadius),
              padding: `${pxToRem(search.resultPaddingY)} ${pxToRem(search.resultPaddingX)}`,
            }}
            type="button"
          >
            <div className="flex items-center" style={{ gap: pxToRem(search.resultHeadGap) }}>
              <Avatar
                alt={result.author.displayName}
                className="shrink-0"
                fallback={result.author.displayName}
                src={result.author.avatarUrl}
                style={{
                  fontSize: pxToRem(search.resultAvatarFontSize),
                  height: pxToRem(search.resultAvatarSize),
                  width: pxToRem(search.resultAvatarSize),
                }}
              />
              <span
                className="min-w-0 truncate"
                style={{
                  color: "hsl(var(--foreground))",
                  font: `600 ${pxToRem(search.resultNameFontSize)}/1 var(--font-sans), sans-serif`,
                }}
              >
                {result.author.displayName}
              </span>
              <span
                className="ml-auto shrink-0"
                style={{
                  color: "hsl(var(--text-muted))",
                  font: `500 ${pxToRem(search.resultTimeFontSize)}/1 var(--font-sans), sans-serif`,
                }}
              >
                {timeFormatter.format(new Date(result.createdAt))}
              </span>
            </div>
            <div
              style={{
                color: "hsl(var(--text-secondary))",
                fontSize: pxToRem(search.resultBodyFontSize),
                lineHeight: search.resultBodyLineHeight,
                marginTop: pxToRem(search.resultBodyMarginTop),
              }}
            >
              {buildHighlightSegments(
                getResultPreview(result, t("chat.search.attachmentOnly")),
                normalizedQuery,
                locale,
              ).map((segment, index) =>
                segment.highlighted ? (
                  <span
                    key={`${result.id}-${index}`}
                    style={{
                      background: `hsl(var(--warning)/${search.resultHighlightAlpha})`,
                      borderRadius: pxToRem(search.resultHighlightRadius),
                      color: "hsl(var(--foreground))",
                      fontWeight: 600,
                      padding: `${pxToRem(search.resultHighlightPaddingY)} ${pxToRem(
                        search.resultHighlightPaddingX,
                      )}`,
                    }}
                  >
                    {segment.text}
                  </span>
                ) : (
                  <span key={`${result.id}-${index}`}>{segment.text}</span>
                ),
              )}
            </div>
            {result.channelName ? (
              <div
                className="flex items-center"
                style={{
                  gap: pxToRem(search.resultChipsGap),
                  marginTop: pxToRem(search.resultChipsMarginTop),
                }}
              >
                <span
                  style={{
                    background: "hsl(var(--surface-soft))",
                    borderRadius: pxToRem(search.resultChipRadius),
                    color: "hsl(var(--text-muted))",
                    font: `600 ${pxToRem(search.resultChipFontSize)}/1 ${DISPLAY_FONT}`,
                    letterSpacing: DISPLAY_TRACKING,
                    padding: `${pxToRem(search.resultChipPaddingY)} ${pxToRem(
                      search.resultChipPaddingX,
                    )}`,
                  }}
                >
                  #{result.channelName}
                </span>
              </div>
            ) : null}
          </button>
        ))}

        {nextCursor ? (
          <button
            className="w-full cursor-pointer text-app-foreground transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-70"
            data-testid="server-search-load-more"
            disabled={isLoadingMore}
            onClick={loadMore}
            style={{
              background: "hsl(var(--surface-card))",
              border: `${hairline()} solid hsl(var(--border)/${search.resultBorderAlpha})`,
              borderRadius: pxToRem(search.resultRadius),
              font: `600 ${pxToRem(search.resultNameFontSize)}/1 var(--font-sans), sans-serif`,
              padding: `${pxToRem(search.resultPaddingY)} ${pxToRem(search.resultPaddingX)}`,
            }}
            type="button"
          >
            {t("chat.search.loadMore")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
