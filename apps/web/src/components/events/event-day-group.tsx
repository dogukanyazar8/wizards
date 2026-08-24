"use client";

import React, { useId } from "react";

import { EVENT_DISPLAY_FONT } from "@/components/events/event-kind-tile";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";
import { cn } from "@/lib/utils";

/**
 * Bir gün grubu — SPEC §3.5, `.dc.html` `:329`–`:334`.
 *
 * Grup bir `<section aria-labelledby>` ve başlığı bir `<h2>`: akış bir başlık ağacıdır, ekran
 * okuyucu kullanıcısı `Bugün`den `Bu hafta`ya başlıktan başlığa atlayabilmeli.
 *
 * Izgara kabı **`role="grid"` değil**: kartlar bağımsız `article`'lardır ve `grid` rolü hücre
 * semantiği (satır/sütun/`aria-colindex`) sözü verir. `auto-fill` ile kolon sayısı CSS'ten
 * geliyor, JavaScript onu bilmiyor — verilemeyecek bir söz.
 *
 * `--e-min` burada **yazılmaz**, kaptan miras alınır: kart boyutu değişince tek bir değişken
 * oynar, gruplar yeniden kurulmaz.
 */

const { grid } = EVENTS_METRICS;

export type EventDayGroupProps = {
  readonly children: React.ReactNode;
  /** `27 Ağustos` ya da `29 Ağustos – 2 Eylül`; sunucudan değil, `presentation.ts`'ten. */
  readonly date: string;
  readonly count: number;
  readonly label: string;
};

export function EventDayGroup({ children, count, date, label }: EventDayGroupProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} data-testid="event-day-group">
      <div
        className="flex items-center"
        style={{
          gap: pxToRem(grid.groupHeaderGap),
          padding: `${pxToRem(grid.groupHeaderPaddingTop)} ${pxToRem(
            grid.groupHeaderPaddingX,
          )} ${pxToRem(grid.groupHeaderPaddingBottom)}`,
        }}
      >
        <h2
          className={cn("m-0 uppercase text-[hsl(var(--text-muted))]", EVENT_DISPLAY_FONT)}
          id={headingId}
          style={{
            fontSize: pxToRem(grid.groupLabelFontSize),
            fontWeight: grid.groupLabelWeight,
            letterSpacing: `${grid.groupLabelLetterSpacing}em`,
            lineHeight: 1,
          }}
        >
          {label}
        </h2>
        <span
          className={cn(EVENT_DISPLAY_FONT)}
          data-testid="event-day-group-count"
          style={{
            color: `hsl(var(--text-muted)/${grid.groupCountAlpha})`,
            fontSize: pxToRem(grid.groupLabelFontSize),
            fontWeight: grid.groupLabelWeight,
            lineHeight: 1,
          }}
        >
          {count}
        </span>
        <span
          data-testid="event-day-group-date"
          style={{
            color: `hsl(var(--text-muted)/${grid.groupCountAlpha})`,
            fontSize: pxToRem(grid.groupDateFontSize),
            fontWeight: grid.groupDateWeight,
            lineHeight: 1,
          }}
        >
          {date}
        </span>
        <span
          aria-hidden="true"
          className="flex-1"
          style={{
            background: `hsl(var(--border)/${grid.groupRuleAlpha})`,
            height: hairline(),
          }}
        />
      </div>

      <div
        className="grid"
        data-testid="event-day-group-grid"
        style={{
          gap: pxToRem(grid.gap),
          gridTemplateColumns: "repeat(auto-fill,minmax(var(--e-min),1fr))",
          paddingBottom: pxToRem(grid.rowPaddingBottom),
        }}
      >
        {children}
      </div>
    </section>
  );
}
