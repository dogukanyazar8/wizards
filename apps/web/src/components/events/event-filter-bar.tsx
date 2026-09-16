"use client";

import React from "react";
import { X } from "lucide-react";
import type { EventMineFilter, EventTimeFilter } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, hairline, pxToEm, pxToRem } from "@/lib/events/metrics";

/**
 * Filtre şeridi — SPEC §3.3.
 *
 * **Yalnız aktif filtre varken** çizilir: boş bir şerit, ızgaranın üstünde hiçbir şey söylemeyen
 * bir çizgi bırakır ve akışın ilk satırını aşağı iter.
 *
 * Sekme (`tab`) çip **üretmez** — sekme başlıkta zaten görünür ve iki yerde göstermek
 * `Tümünü temizle`nin ne yapacağını belirsizleştirir. `Tümünü temizle` sekmeyi de `all`'a çeker;
 * o davranış eksen sahibinin (`onClearAll`) işidir, şeridin değil.
 */

const { filterBar } = EVENTS_METRICS;

export type EventFilterAxis = "date" | "mine" | "query" | "source" | "time";

/**
 * Bir çip ya bir sözlük anahtarıdır (`key` + `params`) ya da sunucudaki **verinin kendisidir**
 * (`text`). Kaynak çipi ikincisidir: sunucu adı çevrilecek bir cümle değil.
 */
export type EventFilterChipDescriptor = {
  readonly axis: EventFilterAxis;
  readonly key: string | null;
  readonly params: Readonly<Record<string, string>> | null;
  readonly text: string | null;
};

export type EventFilterBarState = {
  readonly date?: string | null;
  readonly mine: EventMineFilter | null;
  readonly query: string | null;
  readonly source: { readonly id: string; readonly name: string } | null;
  readonly time: EventTimeFilter | null;
};

export type EventFilterBarProps = {
  readonly onClearAll: () => void;
  readonly onRemove: (axis: EventFilterAxis) => void;
  readonly state: EventFilterBarState;
};

/** Çip sırası tasarımın sırasıdır: zaman → kaynak → katılım → arama. */
export function buildEventFilterChips(
  state: EventFilterBarState,
): readonly EventFilterChipDescriptor[] {
  const chips: EventFilterChipDescriptor[] = [];

  if (state.date) {
    chips.push({ axis: "date", key: null, params: null, text: state.date });
  }

  if (state.time) {
    chips.push({
      axis: "time",
      key: `events.filters.time.${state.time}`,
      params: null,
      text: null,
    });
  }

  if (state.source) {
    chips.push({ axis: "source", key: null, params: null, text: state.source.name });
  }

  if (state.mine) {
    chips.push({
      axis: "mine",
      key: `events.filters.mine.${state.mine}`,
      params: null,
      text: null,
    });
  }

  if (state.query) {
    chips.push({
      axis: "query",
      key: "events.filters.query",
      params: { query: state.query },
      text: null,
    });
  }

  return chips;
}

export function EventFilterBar({ onClearAll, onRemove, state }: EventFilterBarProps) {
  const { locale, t } = useI18n();
  const chips = buildEventFilterChips(state);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div
      aria-label={t("events.a11y.filterBar")}
      className="flex flex-wrap items-center"
      data-testid="events-filter-bar"
      role="region"
      style={{
        background: "hsl(var(--primary)/0.06)",
        borderBottom: `${hairline()} solid hsl(var(--border)/${filterBar.borderBottomAlpha})`,
        gap: pxToRem(filterBar.gap),
        padding: `${pxToRem(filterBar.paddingY)} ${pxToRem(filterBar.paddingX)}`,
      }}
    >
      <span
        className="font-display uppercase"
        style={{
          color: "hsl(var(--primary))",
          fontSize: pxToRem(filterBar.labelFontSize),
          fontWeight: filterBar.labelWeight,
          letterSpacing: `${filterBar.labelLetterSpacing}em`,
          lineHeight: 1,
        }}
      >
        {t("events.filters.label")}
      </span>

      {chips.map((chip) => {
        const label =
          chip.axis === "date" && chip.text
            ? new Intl.DateTimeFormat(locale, {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${chip.text}T12:00:00.000Z`))
            : chip.key
              ? t(chip.key, chip.params ?? undefined)
              : (chip.text ?? "");

        return (
          <span
            className="flex items-center"
            key={chip.axis}
            style={{
              background: "hsl(var(--surface-card))",
              border: `${hairline()} solid hsl(var(--primary)/${filterBar.chipBorderAlpha})`,
              borderRadius: pxToRem(filterBar.chipRadius),
              color: "hsl(var(--foreground))",
              fontSize: pxToRem(filterBar.chipFontSize),
              fontWeight: filterBar.chipWeight,
              gap: pxToRem(filterBar.chipGap),
              lineHeight: 1,
              padding: [
                pxToRem(filterBar.chipPaddingTop),
                pxToRem(filterBar.chipPaddingRight),
                pxToRem(filterBar.chipPaddingBottom),
                pxToRem(filterBar.chipPaddingLeft),
              ].join(" "),
            }}
          >
            {label}
            <button
              aria-label={t("events.filters.remove", { label })}
              className="grid place-items-center transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid={`events-filter-remove-${chip.axis}`}
              onClick={() => onRemove(chip.axis)}
              style={{
                background: "hsl(var(--surface-tertiary))",
                borderRadius: pxToRem(filterBar.chipRemoveRadius),
                color: "hsl(var(--text-muted))",
                height: pxToRem(filterBar.chipRemoveSize),
                width: pxToRem(filterBar.chipRemoveSize),
              }}
              type="button"
            >
              <X
                aria-hidden="true"
                style={{
                  height: pxToEm(filterBar.chipRemoveIconSize),
                  width: pxToEm(filterBar.chipRemoveIconSize),
                }}
              />
            </button>
          </span>
        );
      })}

      <button
        className="ml-auto transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="events-filter-clear-all"
        onClick={onClearAll}
        style={{
          color: "hsl(var(--primary))",
          fontSize: pxToRem(filterBar.clearAllFontSize),
          fontWeight: filterBar.clearAllWeight,
          lineHeight: 1,
        }}
        type="button"
      >
        {t("events.filters.clearAll")}
      </button>
    </div>
  );
}
