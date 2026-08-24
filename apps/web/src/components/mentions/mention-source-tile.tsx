"use client";

import React from "react";
import type { MentionSource } from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { pxToRem } from "@/lib/mentions/metrics";
import { cn } from "@/lib/utils";

/**
 * Kaynak karesi — kartın üst satırındaki 17×17 (SPEC §5) ve bağlam paneli başlığındaki 16×16
 * (SPEC §6) aynı bileşen.
 *
 * DM kaynağında kare **yuvarlaktır**: bir sunucu bir kutu, bir kişi bir daire. Aynı biçimde
 * çizilseydi kullanıcı ray dışında da kaynağın türünü baş harfe bakarak tahmin etmek zorunda
 * kalırdı.
 *
 * Baş harf **sunucudan** gelir (`source.serverInitial`, Ş3). İstemcide ada `slice(0,1)`
 * uygulamak, birleşik grafemli adlarda (ör. bir emoji ile başlayan sunucu adı) yarım karakter
 * çizerdi.
 */

export type MentionSourceTileProps = {
  readonly radius: number;
  readonly size: number;
  readonly source: MentionSource;
  readonly fontSize: number;
};

export function MentionSourceTile({ fontSize, radius, size, source }: MentionSourceTileProps) {
  const dm = source.type === "dm";
  const initial = dm ? (Array.from(source.title.trim())[0] ?? "?") : source.serverInitial;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center uppercase",
        DISPLAY_FONT,
        dm
          ? "bg-[hsl(var(--info)/0.18)] text-[hsl(var(--info))]"
          : "bg-[hsl(var(--primary)/0.18)] text-[hsl(var(--primary))]",
      )}
      data-testid="mention-source-tile"
      data-type={source.type}
      style={{
        borderRadius: dm ? "9999px" : pxToRem(radius),
        fontSize: pxToRem(fontSize),
        fontWeight: 600,
        height: pxToRem(size),
        lineHeight: 1,
        width: pxToRem(size),
      }}
    >
      {initial}
    </span>
  );
}

/**
 * `{sunucu} › #{kanal}` ya da `Direkt mesajlar › {ad}` — iki yüzeyde de aynı cümle
 * (`mentions.card.source` / `mentions.card.sourceDm`).
 */
export function resolveMentionSourceLabel(
  source: MentionSource,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  return source.type === "dm"
    ? t("mentions.card.sourceDm", { title: source.title })
    : t("mentions.card.source", { channel: source.channelName, server: source.serverName });
}
