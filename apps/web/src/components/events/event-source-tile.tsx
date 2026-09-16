"use client";

import React from "react";
import type { WhisprEvent } from "@wizards/types";

import { EVENT_DISPLAY_FONT } from "@/components/events/event-kind-tile";
import { pxToRem } from "@/lib/events/metrics";
import { resolveServerIconPresentation } from "@/lib/servers/server-icon-presentation";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";

/**
 * Kaynak karesi — kartta 16×16 (SPEC §3.6), detay panelinde 15×15 (§5), oluştur modalında
 * 18×18 (§6). Tek kural, üç ölçü: ölçüler prop, kural burada.
 *
 * **K3 dili:** izleyicinin **üye olmadığı** herkese açık bir etkinliğin kaynağı bir sunucu
 * kimliği değil, "topluluk"tur — kare `--surface-tertiary` zemine düşer, `%50` yarıçapla
 * yuvarlanır ve `TK` işaretini taşır (`.dc.html` `SRC.topluluk`). Bir sunucu bir kutu, bir
 * topluluk bir dairedir; aynı biçimde çizilseydi üye olunan ve olunmayan kaynak yalnız renkten
 * ayırt edilirdi.
 *
 * Üye olunan sunucuda yüklenen görsel önceliklidir; görsel yoksa kayıtlı üç harf ve renk tonu
 * kullanılır. Eski kayıtlar aynı sunum yardımcısıyla güvenli fallback alır.
 *
 * Kare süslemedir: yanındaki `{sunucu} › {kanal}` satırı aynı bilgiyi metin olarak yazıyor.
 */

/**
 * `.dc.html` `SRC.topluluk.i`. Bir cümle değil bir **işaret** — `EVENT_KIND_GLYPH` ile aynı
 * sınıfta durur, o yüzden sözlükte değil kodda.
 */
export const EVENT_PUBLIC_SOURCE_GLYPH = "TK";

export type EventSourceTileProps = {
  readonly event: Pick<
    WhisprEvent,
    | "isPublic"
    | "serverIconColor"
    | "serverIconUrl"
    | "serverName"
    | "serverShortName"
    | "viewerIsMember"
  >;
  readonly fontSize: number;
  readonly radius: number;
  readonly size: number;
};

export function EventSourceTile({ event, fontSize, radius, size }: EventSourceTileProps) {
  const community = !event.viewerIsMember && event.isPublic;
  const presentation = resolveServerIconPresentation({
    iconColor: event.serverIconColor,
    iconUrl: event.serverIconUrl,
    name: event.serverName,
    shortName: event.serverShortName ?? null,
  });

  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center uppercase ${EVENT_DISPLAY_FONT}`}
      data-public={community || undefined}
      data-testid="event-source-tile"
      style={{
        backgroundColor: community
          ? "hsl(var(--surface-tertiary))"
          : presentation.kind === "fallback"
            ? getServerIconToneColor(presentation.tone)
            : "hsl(var(--surface-tertiary))",
        backgroundImage:
          !community && presentation.kind === "image"
            ? `url("${presentation.imageUrl}")`
            : undefined,
        backgroundPosition: "center",
        backgroundSize: "cover",
        borderRadius: community ? "50%" : pxToRem(radius),
        color: community ? "hsl(var(--text-secondary))" : "white",
        fontSize: pxToRem(fontSize),
        fontWeight: 600,
        height: pxToRem(size),
        lineHeight: 1,
        width: pxToRem(size),
      }}
    >
      {community
        ? EVENT_PUBLIC_SOURCE_GLYPH
        : presentation.kind === "fallback"
          ? presentation.label
          : null}
    </span>
  );
}
