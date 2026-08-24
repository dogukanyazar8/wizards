"use client";

import React from "react";
import { EVENT_KIND_GLYPH, EVENT_KIND_TONE, type EventKind } from "@wizards/types";

import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";
import { cn } from "@/lib/utils";

/**
 * Tür karesi, tür pili ve canlı pili — SPEC §3.6, `.dc.html` `:337`–`:349`.
 *
 * **Ton bir token adıdır, renk değil** (`EVENT_KIND_TONE.game === "--warning"`). Renk buraya
 * yazılsaydı `theme-light` ↔ `theme-dark` geçişi bu dosyayı atlar ve sözlük tek doğruluk
 * kaynağı olmaktan çıkardı.
 *
 * **Renk tek başına anlam taşımaz:** tür pili glifin yanında türün adını da yazar, canlı pili
 * noktanın yanında `Canlı` metnini taşır. Kırmızıyı ayırt edemeyen bir kullanıcı için nokta
 * tek başına hiçbir şey söylemez.
 *
 * Üç ölçü de prop: aynı kare kartta 42, detay panelinde 38, oluştur modalında 26 çiziliyor
 * (SPEC §3.6 / §5 / §6). Ölçüler çağıranın sözlük bloğundan gelir, burada sabit yok.
 */

/**
 * `components/home/home-primitives` **bu ekranda kullanılmaz** (00-ortak-baglam §2.5); tek
 * satırlık sınıf, `shell/server-icon.tsx` gibi yerel olarak duruyor.
 */
export const EVENT_DISPLAY_FONT = "[font-family:var(--font-display),sans-serif]";

const { card } = EVENTS_METRICS;

/** `hsl(var(--warning)/0.14)` — soft zemin; tonu çağıran değil harita belirler. */
export function eventKindSurface(kind: EventKind, alpha: number): string {
  return `hsl(var(${EVENT_KIND_TONE[kind]})/${alpha})`;
}

export function eventKindColor(kind: EventKind): string {
  return `hsl(var(${EVENT_KIND_TONE[kind]}))`;
}

export type EventKindTileProps = {
  readonly fontSize: number;
  readonly kind: EventKind;
  readonly radius: number;
  readonly size: number;
};

export function EventKindTile({ fontSize, kind, radius, size }: EventKindTileProps) {
  return (
    <div
      aria-hidden="true"
      className="grid flex-none place-items-center"
      data-kind={kind}
      data-testid="event-kind-tile"
      style={{
        background: eventKindSurface(kind, card.kindSurfaceAlpha),
        borderRadius: pxToRem(radius),
        color: eventKindColor(kind),
        height: pxToRem(size),
        width: pxToRem(size),
      }}
    >
      <span
        className={EVENT_DISPLAY_FONT}
        style={{
          fontSize: pxToRem(fontSize),
          fontWeight: card.kindGlyphWeight,
          lineHeight: 1,
        }}
      >
        {EVENT_KIND_GLYPH[kind]}
      </span>
    </div>
  );
}

export type EventKindPillProps = {
  readonly fontSize?: number;
  readonly kind: EventKind;
  readonly label: string;
};

export function EventKindPill({
  fontSize = card.kindPillFontSize,
  kind,
  label,
}: EventKindPillProps) {
  return (
    <span
      className="flex-none"
      data-kind={kind}
      data-testid="event-kind-pill"
      style={{
        background: eventKindSurface(kind, card.kindSurfaceAlpha),
        borderRadius: pxToRem(card.kindPillRadius),
        color: eventKindColor(kind),
        fontSize: pxToRem(fontSize),
        fontWeight: card.kindPillWeight,
        lineHeight: 1,
        padding: `${pxToRem(card.kindPillPaddingY)} ${pxToRem(card.kindPillPaddingX)}`,
      }}
    >
      {label}
    </span>
  );
}

export type EventLivePillProps = {
  readonly label: string;
};

export function EventLivePill({ label }: EventLivePillProps) {
  return (
    <span
      className={cn("flex flex-none items-center")}
      data-testid="event-live-pill"
      style={{
        background: `hsl(var(--danger)/${card.livePillSurfaceAlpha})`,
        borderRadius: pxToRem(card.kindPillRadius),
        color: "hsl(var(--danger))",
        fontSize: pxToRem(card.kindPillFontSize),
        fontWeight: card.kindPillWeight,
        gap: pxToRem(card.livePillGap),
        lineHeight: 1,
        padding: `${pxToRem(card.kindPillPaddingY)} ${pxToRem(card.kindPillPaddingX)}`,
      }}
    >
      <span
        aria-hidden="true"
        data-testid="event-card-live-dot"
        style={{
          background: "hsl(var(--danger))",
          borderRadius: "50%",
          height: pxToRem(card.livePillDotSize),
          width: pxToRem(card.livePillDotSize),
        }}
      />
      {label}
    </span>
  );
}
