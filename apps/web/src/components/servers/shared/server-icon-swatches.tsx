"use client";

import React from "react";

import type { ServerIconTone } from "@wizards/types";

import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import {
  SERVER_ICON_TONE_ORDER,
  getServerIconToneColor,
  resolveServerIconTone,
} from "@/lib/servers/server-icon-tone";

/**
 * SPEC-SUNUCU §7.1 ve §8.1 — altı renk swatch'ı.
 *
 * Ş10 §"Sınırlar": sunucu ayarlarındaki `Genel` bölümü (Ş11) bu satırı **kopyalamaz**, ortak
 * parçadan alır. Aksi hâlde yedinci bir ton eklendiği gün iki yüzey iki farklı palet gösterirdi.
 *
 * Seçim `null` olabilir: hiçbir swatch açıkça seçilmemişken çerçeve **türetilmiş** tonun
 * üstünde durur (`Sunucu.dc.html` satır 2326 `csTone === t`), yani kullanıcı formu ilk açtığında
 * ikonun rengiyle çerçevenin yeri aynıdır. Seçim yapılınca `iconColor` dolar; `null` gönderilmesi
 * "eski deterministik türetmeye dön" demektir (Ş1 sözleşmesi).
 *
 * A11y (00 §8): `role="radiogroup"` + ok tuşları; her swatch `role="radio"` ve tonun adını
 * taşıyan bir `aria-label` alır — renk tek ipucu olamaz.
 */

const { createServer, settingsSections } = SERVER_METRICS;

/**
 * İki yüzey, iki ölçü: oluşturma penceresi `26 r9` + `10` üst boşluk (§7.1), sunucu
 * ayarlarının `Genel` bölümü `27 r9` ve üst boşluksuz (§8.1 — satır kartın ilk çocuğu).
 * Bileşen tek; sayılar sözlükten gelir ve **hiçbiri** buraya yazılmaz.
 */
export type ServerIconSwatchesVariant = "create" | "settings";

function swatchMetrics(variant: ServerIconSwatchesVariant) {
  if (variant === "settings") {
    return {
      borderWidth: settingsSections.generalSwatchBorderWidth,
      gap: settingsSections.generalSwatchGap,
      marginTop: 0,
      radius: settingsSections.generalSwatchRadius,
      size: settingsSections.generalSwatchSize,
    };
  }

  return {
    borderWidth: createServer.swatchBorderWidth,
    gap: createServer.swatchGap,
    marginTop: createServer.swatchMarginTop,
    radius: createServer.swatchRadius,
    size: createServer.swatchSize,
  };
}

export type ServerIconSwatchesProps = {
  readonly onSelect: (tone: ServerIconTone) => void;
  /** Türetilen tonun kaynağı: kullanıcının gördüğü kısa ad. */
  readonly shortName: string;
  readonly testId?: string;
  readonly toneLabel: (tone: ServerIconTone) => string;
  readonly value: ServerIconTone | null;
  readonly variant?: ServerIconSwatchesVariant | undefined;
};

export function ServerIconSwatches({
  onSelect,
  shortName,
  testId,
  toneLabel,
  value,
  variant = "create",
}: ServerIconSwatchesProps) {
  const metrics = swatchMetrics(variant);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const activeTone = resolveServerIconTone(value, shortName);
  const activeIndex = Math.max(SERVER_ICON_TONE_ORDER.indexOf(activeTone), 0);

  const move = (offset: number) => {
    const count = SERVER_ICON_TONE_ORDER.length;
    const next = (((activeIndex + offset) % count) + count) % count;
    const tone = SERVER_ICON_TONE_ORDER[next];

    if (!tone) {
      return;
    }

    onSelect(tone);
    containerRef.current?.querySelectorAll<HTMLButtonElement>("[role='radio']")[next]?.focus();
  };

  return (
    <div
      className="flex flex-wrap"
      data-testid={testId}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
      ref={containerRef}
      role="radiogroup"
      style={{
        gap: pxToRem(metrics.gap),
        marginTop: metrics.marginTop === 0 ? undefined : pxToRem(metrics.marginTop),
      }}
    >
      {SERVER_ICON_TONE_ORDER.map((tone, index) => {
        const selected = tone === activeTone;

        return (
          <button
            aria-checked={selected}
            aria-label={toneLabel(tone)}
            className="p-0 transition hover:-translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            key={tone}
            onClick={() => onSelect(tone)}
            role="radio"
            style={{
              background: getServerIconToneColor(tone),
              borderColor: selected ? "hsl(var(--foreground))" : "transparent",
              borderRadius: pxToRem(metrics.radius),
              borderStyle: "solid",
              borderWidth: pxToRem(metrics.borderWidth),
              height: pxToRem(metrics.size),
              transitionDuration: `${createServer.swatchTransitionMs}ms`,
              width: pxToRem(metrics.size),
            }}
            tabIndex={index === activeIndex ? 0 : -1}
            type="button"
          />
        );
      })}
    </div>
  );
}
