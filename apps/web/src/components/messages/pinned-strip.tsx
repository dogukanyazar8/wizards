"use client";

import React from "react";
import { Pin, X } from "lucide-react";
import type { PinnedMessageDTO } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";

/**
 * Sabitlenen mesaj şeridi — SPEC-MESAJLAR §5.2, karar #7.
 *
 * Şerit yalnız **en yeni** sabitin önizlemesini taşır; listenin tamamı
 * `Tümünü gör` ile açılan sayfaya aittir. Şeridin içine liste koymak, sohbetin
 * üstünü sabit sayısı kadar büyütür ve mesajları aşağı iterdi.
 *
 * Kapatma kalıcı **değildir**: `dismissedId` yalnız o an görülen sabiti saklar,
 * yeni bir sabit gelince şerit kendiliğinden geri döner. Kalıcı kapatma, birinin
 * sabitlediği bir mesajın diğerine hiç görünmemesi demek olurdu.
 */

const { pinnedStrip } = MESSAGES_METRICS;

export type PinnedStripProps = {
  /** Görüntüleyenin kapattığı sabitin kimliği; `null` ise şerit açıktır. */
  dismissedId: string | null;
  onDismiss: (messageId: string) => void;
  onSeeAll: () => void;
  pins: readonly PinnedMessageDTO[];
};

/** Şeridin çizilip çizilmeyeceği — kapatma mantığının tek kaynağı. */
export function selectVisiblePin(
  pins: readonly PinnedMessageDTO[],
  dismissedId: string | null,
): PinnedMessageDTO | null {
  // Uç sabitleri en yeniden eskiye sıralıyor; ilk kayıt en yenisidir.
  const newest = pins[0];

  if (!newest) {
    return null;
  }

  return newest.messageId === dismissedId ? null : newest;
}

export function PinnedStrip({ dismissedId, onDismiss, onSeeAll, pins }: PinnedStripProps) {
  const { t } = useI18n();
  const visible = selectVisiblePin(pins, dismissedId);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 items-center bg-[hsl(var(--surface-secondary)/0.6)]"
      data-testid="pinned-strip"
      style={{
        borderBottom: `${hairline()} solid hsl(var(--border)/0.45)`,
        gap: pxToRem(pinnedStrip.gap),
        padding: `${pxToRem(pinnedStrip.paddingY)} ${pxToRem(pinnedStrip.paddingX)}`,
      }}
    >
      <Pin
        aria-hidden="true"
        className="shrink-0 text-[hsl(var(--primary))]"
        style={{ height: pxToRem(pinnedStrip.iconSize), width: pxToRem(pinnedStrip.iconSize) }}
      />

      <span
        className="shrink-0 text-[hsl(var(--foreground))]"
        data-testid="pinned-strip-count"
        style={{ fontSize: pxToRem(pinnedStrip.countFontSize), fontWeight: 600 }}
      >
        {t("messages.conversation.pinnedStrip.count", { count: pins.length })}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-[hsl(var(--text-secondary))]"
        data-testid="pinned-strip-preview"
        style={{ fontSize: pxToRem(pinnedStrip.previewFontSize) }}
      >
        {visible.authorName}: {visible.excerpt}
      </span>

      <button
        className="shrink-0 text-[hsl(var(--primary))] transition hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="pinned-strip-see-all"
        onClick={onSeeAll}
        style={{ fontSize: pxToRem(pinnedStrip.actionFontSize), fontWeight: 600 }}
        type="button"
      >
        {t("messages.conversation.pinnedStrip.seeAll")}
      </button>

      <button
        aria-label={t("messages.conversation.pinnedStrip.dismiss")}
        className="grid shrink-0 place-items-center rounded-full text-[hsl(var(--text-soft))] transition hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="pinned-strip-dismiss"
        onClick={() => onDismiss(visible.messageId)}
        style={{ height: pxToRem(20), width: pxToRem(20) }}
        type="button"
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
