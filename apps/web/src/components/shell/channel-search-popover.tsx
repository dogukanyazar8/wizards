"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Search, Volume2 } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import { SERVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/servers/metrics";

/**
 * Kanal arama — SPEC-SUNUCU §2.3.
 *
 * Tetikleyici bir **düğme**, kutu değil: bugünkü inline `input` kaldırıldı. Fark görünüşte
 * değil davranışta — inline kutu yazdıkça listeyi süzüyordu ve daraltılmış kategorideki kanal
 * hiç bulunamıyordu; popover kendi sonuç listesini çiziyor, kategori daraltılmış olsa da
 * kanalı buluyor.
 *
 * Gerçek `Ctrl/Cmd+K`, uygulama geneli komut paletine; konuşma içi arama `Ctrl/Cmd+F`'e
 * aittir. Bu yerel kanal filtresi yanıltıcı bir kısayol göstermez ve hiçbir `keydown` bağlamaz.
 */

export type ChannelSearchHit = {
  categoryLabel: string;
  id: string;
  name: string;
  type: "TEXT" | "VOICE";
};

export type ChannelSearchTriggerProps = {
  onOpen: () => void;
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function ChannelSearchTrigger({ onOpen, open, triggerRef }: ChannelSearchTriggerProps) {
  const { t } = useI18n();
  const { sidebar } = SERVER_METRICS;

  return (
    <div
      style={{
        padding: `${pxToRem(sidebar.searchWrapperPaddingTop)} ${pxToRem(
          sidebar.searchWrapperPaddingX,
        )} ${pxToRem(sidebar.searchWrapperPaddingBottom)}`,
      }}
    >
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex w-full items-center transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-sidebar-interactive="true"
        data-testid="channel-search-trigger"
        onClick={onOpen}
        ref={triggerRef}
        style={{
          background: "hsl(var(--surface-soft) / 0.7)",
          border: `${hairline()} solid hsl(var(--border) / ${sidebar.searchButtonBorderAlpha})`,
          borderRadius: pxToRem(sidebar.searchButtonRadius),
          color: "hsl(var(--text-muted))",
          gap: pxToRem(sidebar.searchButtonGap),
          padding: `${pxToRem(sidebar.searchButtonPaddingY)} ${pxToRem(
            sidebar.searchButtonPaddingX,
          )}`,
        }}
        type="button"
      >
        <Search
          aria-hidden="true"
          style={{
            flex: "none",
            height: pxToRem(sidebar.searchIconSize),
            width: pxToRem(sidebar.searchIconSize),
          }}
        />
        <span
          className="min-w-0 flex-1 truncate text-left"
          style={{
            fontSize: pxToRem(sidebar.searchLabelFontSize),
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          {t("server.sidebar.search.placeholder")}
        </span>
      </button>
    </div>
  );
}

export type ChannelSearchPopoverProps = {
  channels: readonly ChannelSearchHit[];
  onClose: () => void;
  onSelect: (channelId: string) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function ChannelSearchPopover({
  channels,
  onClose,
  onSelect,
  triggerRef,
}: ChannelSearchPopoverProps) {
  const { locale, t } = useI18n();
  const { sidebar } = SERVER_METRICS;
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();

    // Kapanışta odak tetikleyiciye döner (00 §8). Sökülme anında okunur, çünkü kapanışın
    // üç yolu var (`Esc`, dış tıklama, sonuç seçimi) ve üçü de aynı yere dönmeli.
    const trigger = triggerRef;

    return () => {
      trigger.current?.focus();
    };
  }, [triggerRef]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (containerRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [onClose, triggerRef]);

  const normalized = query.trim().toLocaleLowerCase(locale);
  const hits = useMemo(
    () =>
      normalized.length === 0
        ? channels
        : channels.filter((channel) => channel.name.toLocaleLowerCase(locale).includes(normalized)),
    [channels, locale, normalized],
  );

  return (
    <div
      aria-label={t("server.sidebar.search.label")}
      className="absolute"
      data-testid="channel-search-popover"
      ref={containerRef}
      role="dialog"
      style={{
        background: "hsl(var(--surface-card))",
        border: `${hairline()} solid hsl(var(--border))`,
        borderRadius: pxToRem(sidebar.searchPopoverRadius),
        boxShadow: `${pxToRem(sidebar.menuShadow.x)} ${pxToRem(sidebar.menuShadow.y)} ${pxToRem(
          sidebar.menuShadow.blur,
        )} ${pxToRem(sidebar.menuShadow.spread)} hsl(var(--shadow-color))`,
        left: pxToRem(sidebar.searchPopoverInsetX),
        padding: pxToRem(sidebar.searchPopoverPadding),
        right: pxToRem(sidebar.searchPopoverInsetX),
        top: pxToRem(sidebar.searchPopoverTop),
        zIndex: sidebar.searchPopoverZIndex,
      }}
    >
      <div
        className="flex items-center"
        style={{
          background: "hsl(var(--surface-soft))",
          border: `${hairline()} solid hsl(var(--primary) / ${sidebar.searchQueryBorderAlpha})`,
          borderRadius: pxToRem(sidebar.searchQueryRadius),
          gap: pxToRem(sidebar.searchQueryGap),
          padding: `${pxToRem(sidebar.searchQueryPaddingY)} ${pxToRem(sidebar.searchQueryPaddingX)}`,
        }}
      >
        <Search
          aria-hidden="true"
          style={{
            color: "hsl(var(--primary))",
            flex: "none",
            height: pxToRem(sidebar.searchQueryIconSize),
            width: pxToRem(sidebar.searchQueryIconSize),
          }}
        />
        <input
          aria-label={t("server.sidebar.search.label")}
          className="min-w-0 flex-1 bg-transparent outline-hidden placeholder:text-[hsl(var(--text-muted))]"
          data-testid="channel-search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("server.sidebar.search.placeholder")}
          ref={inputRef}
          style={{
            color: "hsl(var(--foreground))",
            fontSize: pxToRem(sidebar.searchQueryFontSize),
            fontWeight: 500,
            lineHeight: 1,
          }}
          type="text"
          value={query}
        />
        <button
          className="ml-auto flex-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="channel-search-close"
          onClick={onClose}
          style={{
            color: "hsl(var(--text-muted))",
            fontFamily: DISPLAY_FONT,
            fontSize: pxToRem(sidebar.searchEscFontSize),
            fontWeight: 600,
            lineHeight: 1,
          }}
          type="button"
        >
          ESC
        </button>
      </div>

      <div
        style={{
          color: "hsl(var(--text-muted))",
          fontFamily: DISPLAY_FONT,
          fontSize: pxToRem(sidebar.searchSectionFontSize),
          fontWeight: 600,
          letterSpacing: `${sidebar.searchSectionLetterSpacing}em`,
          lineHeight: 1,
          margin: `${pxToRem(sidebar.searchSectionMarginTop)} ${pxToRem(
            sidebar.searchSectionMarginX,
          )} ${pxToRem(sidebar.searchSectionMarginBottom)}`,
          textTransform: "uppercase",
        }}
      >
        {t("server.sidebar.search.resultCount", { count: hits.length })}
      </div>

      {hits.map((hit) => {
        const Icon = hit.type === "VOICE" ? Volume2 : Hash;

        return (
          <button
            className="flex w-full items-center text-left transition-colors hover:bg-[hsl(var(--surface-soft))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid={`channel-search-hit-${hit.id}`}
            key={hit.id}
            onClick={() => onSelect(hit.id)}
            style={{
              borderRadius: pxToRem(sidebar.searchHitRadius),
              gap: pxToRem(sidebar.searchHitGap),
              padding: `${pxToRem(sidebar.searchHitPaddingY)} ${pxToRem(sidebar.searchHitPaddingX)}`,
            }}
            type="button"
          >
            <span
              className="grid flex-none place-items-center"
              style={{
                color: "hsl(var(--text-muted))",
                height: pxToRem(sidebar.searchHitIconSize),
                width: pxToRem(sidebar.searchHitIconSize),
              }}
            >
              <Icon
                aria-hidden="true"
                style={{
                  height: pxToEm(sidebar.searchHitIconSize, sidebar.searchHitNameFontSize),
                  width: pxToEm(sidebar.searchHitIconSize, sidebar.searchHitNameFontSize),
                }}
              />
            </span>
            <span
              className="min-w-0 flex-1 truncate"
              style={{
                color: "hsl(var(--foreground))",
                fontSize: pxToRem(sidebar.searchHitNameFontSize),
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {hit.name}
            </span>
            <span
              className="flex-none truncate"
              style={{
                color: "hsl(var(--text-muted))",
                fontSize: pxToRem(sidebar.searchHitCategoryFontSize),
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {hit.categoryLabel}
            </span>
          </button>
        );
      })}

      {hits.length === 0 ? (
        <p
          data-testid="channel-search-empty"
          style={{
            color: "hsl(var(--text-muted))",
            fontSize: pxToRem(sidebar.searchHitCategoryFontSize),
            fontWeight: 500,
            padding: `${pxToRem(sidebar.searchHitPaddingY)} ${pxToRem(sidebar.searchHitPaddingX)}`,
          }}
        >
          {t("server.sidebar.search.empty")}
        </p>
      ) : null}
    </div>
  );
}
