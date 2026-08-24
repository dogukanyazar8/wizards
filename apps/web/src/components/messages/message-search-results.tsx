"use client";

import React, { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import type { MessageSearchHitDTO } from "@wizards/types";

import { Avatar } from "@/components/ui/avatar";
import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { toHighlightSegments } from "@/lib/messages/search-highlight";
import { cn } from "@/lib/utils";

/**
 * Arama panelinin gövdesi — SPEC-MESAJLAR §6.2, karar #6.
 *
 * Panelin kabuğundan (`messages-side-panel.tsx`) ve veri katmanından
 * (`use-message-search.ts`) ayrı: gövde saf bir çizim ve testte sunucu
 * render'ıyla doğrulanabiliyor.
 */

const { sidePanel } = MESSAGES_METRICS;

export type SearchFilterChip = {
  id: string;
  label: string;
  /** `true` ise primary tint (kişi filtresi), değilse nötr (tarih ekle). */
  active: boolean;
  onRemove?: (() => void) | undefined;
  onClick?: (() => void) | undefined;
};

export type MessageSearchResultsProps = {
  chips: readonly SearchFilterChip[];
  emptyText?: string | null;
  /** Kaydırma sonuna gelince çağrılır; sonraki sayfa yoksa çizilmez. */
  hasNextPage?: boolean;
  isRefreshing?: boolean;
  onChangeQuery: (query: string) => void;
  onFetchNextPage?: (() => void) | undefined;
  onSelect: (hit: MessageSearchHitDTO) => void;
  query: string;
  results: readonly MessageSearchHitDTO[];
  /** Sonuç sayısı; `null` iken etiket çizilmez (henüz arama yapılmadı). */
  totalLabel: number | null;
};

export function MessageSearchResults({
  chips,
  emptyText,
  hasNextPage = false,
  isRefreshing = false,
  onChangeQuery,
  onFetchNextPage,
  onSelect,
  query,
  results,
  totalLabel,
}: MessageSearchResultsProps) {
  const { t } = useI18n();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchNextRef = useRef(onFetchNextPage);

  useEffect(() => {
    fetchNextRef.current = onFetchNextPage;
  }, [onFetchNextPage]);

  /**
   * Sonsuz kaydırma. `IntersectionObserver` kaydırma olayından ucuz: tarayıcı
   * kesişmeyi kendi düzen turunda hesaplıyor, bizim her kaydırma karesinde
   * `getBoundingClientRect` okumamız gerekmiyor.
   *
   * Gözlemci yalnız sonraki sayfa **varken** kuruluyor; sonu gelmiş bir listede
   * boşuna dinleyen bir gözlemci kalmasın diye.
   */
  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        fetchNextRef.current?.();
      }
    });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasNextPage, results.length]);

  return (
    <>
      <div
        className="shrink-0"
        style={{
          padding: `${pxToRem(sidePanel.searchPaddingTop)} ${pxToRem(sidePanel.searchPaddingX)} ${pxToRem(sidePanel.searchPaddingBottom)}`,
        }}
      >
        <div
          className="flex items-center bg-[hsl(var(--surface-soft)/0.6)]"
          style={{
            border: `${hairline()} solid hsl(var(--border)/0.6)`,
            borderRadius: pxToRem(sidePanel.searchFieldRadius),
            gap: pxToRem(sidePanel.searchFieldGap),
            height: pxToRem(sidePanel.searchFieldHeight),
            padding: `0 ${pxToRem(sidePanel.searchFieldPaddingX)}`,
          }}
        >
          <Search
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-soft))]"
            style={{
              height: pxToRem(sidePanel.searchFieldIconSize),
              width: pxToRem(sidePanel.searchFieldIconSize),
            }}
          />
          <input
            aria-label={t("messages.panel.search.title")}
            className="min-w-0 flex-1 bg-transparent text-[hsl(var(--foreground))] focus-visible:outline-hidden"
            data-testid="message-search-input"
            onChange={(event) => onChangeQuery(event.target.value)}
            placeholder={t("messages.panel.search.placeholder")}
            style={{ fontSize: pxToRem(sidePanel.searchFieldFontSize) }}
            type="search"
            value={query}
          />
        </div>

        {chips.length > 0 ? (
          <div
            className="flex flex-wrap items-center"
            data-testid="message-search-filters"
            style={{
              gap: pxToRem(sidePanel.filterGap),
              marginTop: pxToRem(sidePanel.filterMarginTop),
            }}
          >
            {chips.map((chip) => (
              <span
                className={cn(
                  "inline-flex items-center",
                  chip.active
                    ? "bg-[hsl(var(--primary)/0.14)] text-[var(--primary-readable)]"
                    : "bg-[hsl(var(--surface-tertiary))] text-[hsl(var(--text-secondary))]",
                )}
                data-testid={`message-search-chip-${chip.id}`}
                key={chip.id}
                style={{
                  borderRadius: pxToRem(sidePanel.filterRadius),
                  fontSize: pxToRem(sidePanel.filterFontSize),
                  gap: pxToRem(sidePanel.filterGapInner),
                  height: pxToRem(sidePanel.filterHeight),
                  padding: `0 ${pxToRem(sidePanel.filterPaddingX)}`,
                }}
              >
                {chip.onClick ? (
                  <button
                    className="focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    /* Kimliksiz bir düğme parity raporunda kendi CSS sınıfıyla
                       görünüyordu: hangi yüzey olduğu okunamıyordu. */
                    data-testid={`message-search-chip-toggle-${chip.id}`}
                    onClick={chip.onClick}
                    type="button"
                  >
                    {chip.label}
                  </button>
                ) : (
                  chip.label
                )}
                {chip.onRemove ? (
                  <button
                    aria-label={t("messages.panel.search.removeFilter")}
                    className="grid shrink-0 place-items-center rounded-full transition hover:bg-[hsl(var(--surface-soft)/0.7)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    data-testid={`message-search-chip-remove-${chip.id}`}
                    onClick={chip.onRemove}
                    type="button"
                  >
                    <X
                      aria-hidden="true"
                      style={{
                        height: pxToRem(sidePanel.filterRemoveIconSize),
                        width: pxToRem(sidePanel.filterRemoveIconSize),
                      }}
                    />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          gap: pxToRem(sidePanel.resultsGap),
          padding: `${pxToRem(sidePanel.resultsPaddingTop)} ${pxToRem(sidePanel.resultsPaddingX)} ${pxToRem(sidePanel.resultsPaddingBottom)}`,
        }}
      >
        {totalLabel !== null ? (
          <p
            className={cn("uppercase text-[hsl(var(--text-soft))]", DISPLAY_FONT)}
            data-testid="message-search-count"
            style={{
              fontSize: pxToRem(sidePanel.resultsCountFontSize),
              fontWeight: 600,
              letterSpacing: sidePanel.resultsCountTracking,
              padding: `${pxToRem(sidePanel.resultsCountPaddingY)} ${pxToRem(sidePanel.resultsCountPaddingX)}`,
            }}
          >
            {t("messages.panel.search.resultCount", { count: totalLabel })}
          </p>
        ) : null}

        {totalLabel === 0 ? (
          <p
            className="py-6 text-center text-[hsl(var(--text-secondary))]"
            data-testid="message-search-empty"
            style={{ fontSize: pxToRem(sidePanel.resultBodyFontSize) }}
          >
            {emptyText ?? t("messages.panel.search.empty")}
          </p>
        ) : null}

        {/*
          Yeni sorgu uçuştayken önceki sonuçlar **kaybolmaz**, soluklaşır.
          Boşaltılsaydı yazmayı sürdüren kullanıcının altındaki liste her harfte
          silinip yeniden kurulurdu.
        */}
        <ul
          className={cn(
            "flex flex-col motion-safe:transition-opacity",
            isRefreshing && "opacity-55",
          )}
          data-refreshing={isRefreshing ? "true" : undefined}
          data-testid="message-search-results"
          style={{ gap: pxToRem(sidePanel.resultsGap) }}
        >
          {results.map((hit) => (
            <li key={`${hit.conversationId}:${hit.messageId}`}>
              <button
                className="w-full bg-[hsl(var(--surface-card))] text-left transition hover:border-[hsl(var(--primary))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-safe:hover:-translate-y-px"
                data-testid="message-search-result"
                onClick={() => onSelect(hit)}
                style={{
                  border: `${hairline()} solid hsl(var(--border)/0.6)`,
                  borderRadius: pxToRem(sidePanel.resultRadius),
                  padding: pxToRem(sidePanel.resultPadding),
                }}
                type="button"
              >
                <span
                  className="flex items-center"
                  style={{ gap: pxToRem(sidePanel.resultHeaderGap) }}
                >
                  <Avatar
                    alt={hit.authorName}
                    className="rounded-full"
                    fallback={hit.authorInitials}
                    src={hit.authorAvatarUrl}
                    style={{
                      fontSize: pxToRem(sidePanel.resultAvatarFontSize),
                      height: pxToRem(sidePanel.resultAvatarSize),
                      width: pxToRem(sidePanel.resultAvatarSize),
                    }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[hsl(var(--foreground))]"
                    style={{
                      fontSize: pxToRem(sidePanel.resultNameFontSize),
                      fontWeight: 600,
                    }}
                  >
                    {hit.authorName}
                  </span>
                  <span
                    className="shrink-0 text-[hsl(var(--text-soft))]"
                    style={{ fontSize: pxToRem(sidePanel.resultTimeFontSize) }}
                  >
                    {hit.timeLabel}
                  </span>
                </span>

                <span
                  className="block text-[hsl(var(--text-secondary))]"
                  style={{
                    fontSize: pxToRem(sidePanel.resultBodyFontSize),
                    lineHeight: sidePanel.resultBodyLineHeight,
                    marginTop: pxToRem(sidePanel.resultBodyMarginTop),
                  }}
                >
                  {/*
                    Vurgu aralıkları **sunucudan** geliyor; burada kendi arama
                    mantığımız yok. Olsaydı sunucunun bulduğu satırda başka bir
                    yeri vurgulardık ve fark ancak Türkçe ünsüz yumuşamasında
                    ortaya çıkardı.
                  */}
                  {toHighlightSegments(hit.excerpt, hit.matchRanges).map((segment, index) =>
                    segment.highlighted ? (
                      <mark
                        className="bg-[hsl(var(--primary)/0.18)] text-[hsl(var(--foreground))]"
                        data-testid="message-search-highlight"
                        key={index}
                        style={{
                          borderRadius: pxToRem(sidePanel.highlightRadius),
                          padding: `${pxToRem(sidePanel.highlightPaddingY)} ${pxToRem(sidePanel.highlightPaddingX)}`,
                        }}
                      >
                        {segment.text}
                      </mark>
                    ) : (
                      <React.Fragment key={index}>{segment.text}</React.Fragment>
                    ),
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {hasNextPage ? (
          <div aria-hidden="true" data-testid="message-search-sentinel" ref={sentinelRef} />
        ) : null}
      </div>
    </>
  );
}
