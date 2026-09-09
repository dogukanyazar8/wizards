"use client";

import React from "react";
import { CalendarPlus } from "lucide-react";

import { EVENT_DISPLAY_FONT } from "@/components/events/event-kind-tile";
import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import { cn } from "@/lib/utils";

/**
 * Boş durum — SPEC §3.7, `.dc.html` `:394`–`:404`.
 *
 * `Etkinlik oluştur` **K4'e bakar**: `MANAGE_EVENTS` taşımayan izleyicide çizilmez ve geriye
 * tek başına ortalanmış `Filtreleri temizle` kalır. Yetkisizde de çizilseydi buton ya 403 alır
 * ya da açtığı modal kaydedemezdi — ikisi de boş bir ekranda verilebilecek en kötü cevap.
 *
 * Metin SPEC ile **karakter karakter** aynı (`lib/locale/events-screen-copy.test.ts` sözlükte,
 * `event-grid.test.tsx` ekranda kilitliyor).
 */

const { emptyState } = EVENTS_METRICS;

export type EventsEmptyStateProps = {
  readonly onClearFilters?: () => void;
  readonly onCreate?: () => void;
  /** K4 — `MANAGE_EVENTS`. Üç `Oluştur` girişinin biri burada. */
  readonly viewerCanCreate: boolean;
};

export function EventsEmptyState({
  onClearFilters,
  onCreate,
  viewerCanCreate,
}: EventsEmptyStateProps) {
  const { t } = useI18n();

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center"
      data-testid="events-empty-state"
      style={{ gap: pxToRem(emptyState.gap), padding: pxToRem(emptyState.padding) }}
    >
      <div
        aria-hidden="true"
        className="grid shrink-0 place-items-center text-[hsl(var(--primary))]"
        style={{
          background: `hsl(var(--primary)/${emptyState.iconSurfaceAlpha})`,
          border: `${hairline()} solid hsl(var(--primary)/${emptyState.iconBorderAlpha})`,
          borderRadius: pxToRem(emptyState.iconBoxRadius),
          height: pxToRem(emptyState.iconBox),
          width: pxToRem(emptyState.iconBox),
        }}
      >
        <CalendarPlus
          style={{ height: pxToRem(emptyState.iconSize), width: pxToRem(emptyState.iconSize) }}
        />
      </div>

      <div className="text-center" style={{ maxWidth: pxToRem(emptyState.bodyMaxWidth) }}>
        <h2
          className={cn("m-0 text-[hsl(var(--foreground))]", EVENT_DISPLAY_FONT)}
          style={{
            fontSize: pxToRem(emptyState.titleFontSize),
            fontWeight: emptyState.titleWeight,
            letterSpacing: "-0.02em",
            lineHeight: emptyState.titleLineHeight,
          }}
        >
          {t("events.empty.title")}
        </h2>
        <p
          className="text-[hsl(var(--text-muted))]"
          data-testid="events-empty-body"
          style={{
            fontSize: pxToRem(emptyState.bodyFontSize),
            lineHeight: emptyState.bodyLineHeight,
            margin: `${pxToRem(emptyState.bodyMarginTop)} 0 0`,
            textWrap: "pretty",
          }}
        >
          {t("events.empty.body")}
        </p>
      </div>

      <div className="flex items-center" style={{ gap: pxToRem(emptyState.buttonRowGap) }}>
        {viewerCanCreate ? (
          <button
            className="grid place-items-center text-white transition-[filter] hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="events-empty-create"
            onClick={onCreate}
            style={{
              background: "hsl(var(--primary))",
              border: 0,
              borderRadius: pxToRem(emptyState.buttonRadius),
              boxShadow: `${pxToRem(emptyState.primaryShadow.x)} ${pxToRem(
                emptyState.primaryShadow.y,
              )} ${pxToRem(emptyState.primaryShadow.blur)} ${pxToRem(
                emptyState.primaryShadow.spread,
              )} hsl(var(--primary))`,
              fontSize: pxToRem(emptyState.buttonFontSize),
              fontWeight: emptyState.buttonWeight,
              height: pxToRem(emptyState.buttonHeight),
              lineHeight: 1,
              padding: `0 ${pxToRem(emptyState.buttonPaddingX)}`,
            }}
            type="button"
          >
            {t("events.empty.create")}
          </button>
        ) : null}

        <button
          className="grid place-items-center bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid="events-empty-clear"
          onClick={onClearFilters}
          style={{
            border: `${hairline()} solid hsl(var(--border))`,
            borderRadius: pxToRem(emptyState.buttonRadius),
            fontSize: pxToRem(emptyState.buttonFontSize),
            fontWeight: emptyState.buttonWeight,
            height: pxToRem(emptyState.buttonHeight),
            lineHeight: 1,
            padding: `0 ${pxToRem(emptyState.buttonPaddingX)}`,
          }}
          type="button"
        >
          {t("events.empty.clearFilters")}
        </button>
      </div>
    </div>
  );
}
