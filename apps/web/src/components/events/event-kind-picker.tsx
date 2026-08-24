"use client";

import React from "react";
import { EVENT_KIND_GLYPH, EVENT_KIND_TONE, type EventKind } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { EVENT_CREATE_KINDS } from "@/lib/events/create-form";
import { EVENTS_METRICS, hairline, pxToRem } from "@/lib/events/metrics";

/**
 * Etkinlik türü ızgarası — SPEC §6: 3 kolon, 6 seçenek.
 *
 * `role="radiogroup"` + `role="radio"`: seçenekler birbirini dışlıyor ve ekran okuyucu
 * kullanıcısının hangisinin seçili olduğunu **durum** olarak duyması gerekiyor. Roving
 * tabindex, altı seçeneğin sekme turunda altı kez durmasını engelliyor.
 *
 * Renk tek başına anlam taşımaz: seçili kutu tonun yanında **metnini** de taşır ve tonlar
 * `EVENT_KIND_TONE`dan token adı olarak gelir (`--info` gibi), hex olarak değil.
 */

const { createModal, card } = EVENTS_METRICS;

export type EventKindPickerProps = {
  /** Modal açılışta ilk seçeneğe odaklanır; ref onun için. */
  readonly firstOptionRef?: React.RefObject<HTMLButtonElement | null> | undefined;
  readonly labelledById?: string | undefined;
  readonly onSelect: (kind: EventKind) => void;
  readonly value: EventKind;
};

export function EventKindPicker({
  firstOptionRef,
  labelledById,
  onSelect,
  value,
}: EventKindPickerProps) {
  const { t } = useI18n();

  return (
    <div
      aria-labelledby={labelledById}
      className="grid"
      data-testid="events-kind-picker"
      role="radiogroup"
      style={{
        gap: pxToRem(createModal.kindGridGap),
        gridTemplateColumns: `repeat(${createModal.kindColumns}, 1fr)`,
      }}
    >
      {EVENT_CREATE_KINDS.map((kind, index) => {
        const selected = kind === value;
        const tone = EVENT_KIND_TONE[kind];

        return (
          <button
            aria-checked={selected}
            className="flex flex-col items-start text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-safe:transition-colors"
            data-testid={`events-kind-${kind}`}
            key={kind}
            onClick={() => onSelect(kind)}
            ref={index === 0 ? firstOptionRef : undefined}
            role="radio"
            style={{
              background: selected
                ? `hsl(var(--primary)/${createModal.kindBoxSelectedSurfaceAlpha})`
                : "transparent",
              border: `${hairline()} solid hsl(var(--${selected ? "primary" : "border"})/${
                selected ? createModal.kindBoxSelectedBorderAlpha : createModal.kindBoxBorderAlpha
              })`,
              borderRadius: pxToRem(createModal.kindBoxRadius),
              color: selected ? "hsl(var(--foreground))" : "hsl(var(--text-secondary))",
              gap: pxToRem(createModal.kindBoxGap),
              padding: `${pxToRem(createModal.kindBoxPaddingY)} ${pxToRem(createModal.kindBoxPaddingX)}`,
            }}
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <span
              aria-hidden="true"
              className="font-display grid place-items-center"
              style={{
                background: selected
                  ? `hsl(var(${tone})/${card.kindSurfaceAlpha})`
                  : "hsl(var(--surface-soft))",
                borderRadius: pxToRem(createModal.kindTileRadius),
                color: selected ? `hsl(var(${tone}))` : "hsl(var(--text-muted))",
                fontSize: pxToRem(createModal.kindTileFontSize),
                fontWeight: 600,
                height: pxToRem(createModal.kindTileSize),
                lineHeight: 1,
                width: pxToRem(createModal.kindTileSize),
              }}
            >
              {EVENT_KIND_GLYPH[kind]}
            </span>
            <span
              style={{
                fontSize: pxToRem(createModal.kindNameFontSize),
                fontWeight: createModal.kindNameWeight,
                lineHeight: createModal.kindNameLineHeight,
              }}
            >
              {t(`events.kind.${kind}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
