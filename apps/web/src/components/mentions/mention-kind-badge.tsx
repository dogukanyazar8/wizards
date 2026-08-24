"use client";

import React from "react";
import type { MentionKind } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { MENTION_KIND_TONE } from "@/lib/mentions/contracts";
import { MENTIONS_METRICS, pxToRem } from "@/lib/mentions/metrics";

/**
 * Kartın tür pili — SPEC §5.
 *
 * Ton `MENTION_KIND_TONE` haritasından gelir (Dalga 0): `me` → `--primary`, `role` → `--info`,
 * `everyone` → `--warning`, `thread` → `--success`. Harita ray satırlarıyla **ortak**; pil ile
 * ray satırı aynı türü iki farklı renkte gösteremez.
 *
 * SPEC `role` için `hsl(199 89% 48%)` yazıyor. O ton Dalga 0'da `--info` olarak tanımlandı;
 * pilde ham renk yazmak, temanın kontrol edemediği tek bir renk bırakmak olurdu.
 */

const { card } = MENTIONS_METRICS;

const LABEL_KEY: Readonly<Record<MentionKind, string>> = {
  everyone: "mentions.badge.everyone",
  me: "mentions.badge.me",
  role: "mentions.badge.role",
  thread: "mentions.badge.thread",
};

export type MentionKindBadgeProps = {
  readonly kind: MentionKind;
};

export function MentionKindBadge({ kind }: MentionKindBadgeProps) {
  const { t } = useI18n();
  const tone = MENTION_KIND_TONE[kind];

  return (
    <span
      className="shrink-0 whitespace-nowrap"
      data-kind={kind}
      data-testid="mention-kind-badge"
      style={{
        background: `hsl(var(${tone})/${card.kindBadgeSurfaceAlpha})`,
        borderRadius: pxToRem(card.kindBadgeRadius),
        color: `hsl(var(${tone}))`,
        fontSize: pxToRem(card.kindBadgeFontSize),
        fontWeight: card.kindBadgeWeight,
        // Sözlükteki değer zaten `em` cinsinden (`.02em`); `pxToEm`den geçirmek onu ikinci kez
        // bölerdi.
        letterSpacing: `${card.kindBadgeLetterSpacing}em`,
        lineHeight: 1.4,
        padding: `${pxToRem(card.kindBadgePaddingY)} ${pxToRem(card.kindBadgePaddingX)}`,
      }}
    >
      {t(LABEL_KEY[kind])}
    </span>
  );
}
