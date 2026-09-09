"use client";

import React from "react";
import { Pin, X } from "lucide-react";
import type { PinnedMessageDTO } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { SERVER_METRICS } from "@/lib/servers/metrics";

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
 *
 * **Ş6 (SPEC-SUNUCU §3.2).** Sunucu kanalı aynı şeridi kullanıyor, kendi ölçüleriyle:
 * `8px 20px` boşluk, `surface-secondary/.7` zemin, `border/.4` alt kenar, **warning**
 * raptiye ve `11.5px` metin. Yeni bir bileşen açmak, iki şeridin ilk düzenlemede
 * ayrışması demekti; varyant tek kaynağı korur (şerit dosyası §2'nin açık talebi).
 */

const { pinnedStrip } = MESSAGES_METRICS;
const { pinnedBar } = SERVER_METRICS;

/** `dm` Mesajlar paketinin şeridi, `server` SPEC-SUNUCU §3.2. */
export type PinnedStripVariant = "dm" | "server";

type PinnedStripGeometry = {
  readonly actionFontSize: number;
  readonly backgroundAlpha: number;
  readonly borderBottomAlpha: number;
  readonly countFontSize: number;
  readonly gap: number;
  readonly iconSize: number;
  readonly iconToken: string;
  readonly paddingX: number;
  readonly paddingY: number;
  readonly previewFontSize: number;
};

const GEOMETRY: Record<PinnedStripVariant, PinnedStripGeometry> = {
  dm: {
    actionFontSize: pinnedStrip.actionFontSize,
    backgroundAlpha: 0.6,
    borderBottomAlpha: 0.45,
    countFontSize: pinnedStrip.countFontSize,
    gap: pinnedStrip.gap,
    iconSize: pinnedStrip.iconSize,
    iconToken: "--primary",
    paddingX: pinnedStrip.paddingX,
    paddingY: pinnedStrip.paddingY,
    previewFontSize: pinnedStrip.previewFontSize,
  },
  server: {
    actionFontSize: pinnedBar.actionFontSize,
    backgroundAlpha: pinnedBar.backgroundAlpha,
    borderBottomAlpha: pinnedBar.borderBottomAlpha,
    countFontSize: pinnedBar.titleFontSize,
    gap: pinnedBar.gap,
    iconSize: pinnedBar.iconSize,
    iconToken: "--warning",
    paddingX: pinnedBar.paddingX,
    paddingY: pinnedBar.paddingY,
    previewFontSize: pinnedBar.summaryFontSize,
  },
};

export type PinnedStripProps = {
  /** Görüntüleyenin kapattığı sabitin kimliği; `null` ise şerit açıktır. */
  dismissedId: string | null;
  onDismiss: (messageId: string) => void;
  onSeeAll: () => void;
  pins: readonly PinnedMessageDTO[];
  variant?: PinnedStripVariant;
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

export function PinnedStrip({
  dismissedId,
  onDismiss,
  onSeeAll,
  pins,
  variant = "dm",
}: PinnedStripProps) {
  const { t } = useI18n();
  const visible = selectVisiblePin(pins, dismissedId);
  const geometry = GEOMETRY[variant];

  if (!visible) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 items-center"
      data-testid="pinned-strip"
      data-variant={variant}
      style={{
        background: `hsl(var(--surface-secondary)/${geometry.backgroundAlpha})`,
        borderBottom: `${hairline()} solid hsl(var(--border)/${geometry.borderBottomAlpha})`,
        gap: pxToRem(geometry.gap),
        padding: `${pxToRem(geometry.paddingY)} ${pxToRem(geometry.paddingX)}`,
      }}
    >
      <Pin
        aria-hidden="true"
        className="shrink-0"
        style={{
          color: `hsl(var(${geometry.iconToken}))`,
          height: pxToRem(geometry.iconSize),
          width: pxToRem(geometry.iconSize),
        }}
      />

      <span
        className="shrink-0 text-[hsl(var(--foreground))]"
        data-testid="pinned-strip-count"
        style={{ fontSize: pxToRem(geometry.countFontSize), fontWeight: 600 }}
      >
        {t("messages.conversation.pinnedStrip.count", { count: pins.length })}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-[hsl(var(--text-secondary))]"
        data-testid="pinned-strip-preview"
        style={{ fontSize: pxToRem(geometry.previewFontSize) }}
      >
        {visible.authorName}: {visible.excerpt}
      </span>

      <button
        className="shrink-0 text-[hsl(var(--primary))] transition hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="pinned-strip-see-all"
        onClick={onSeeAll}
        style={{ fontSize: pxToRem(geometry.actionFontSize), fontWeight: 600 }}
        type="button"
      >
        {t("messages.conversation.pinnedStrip.seeAll")}
      </button>

      {/*
        Kapatma düğmesi **yalnız** DM şeridinde. SPEC-SUNUCU §3.2 çubuğu dört parçadan
        kuruyor (raptiye · sayı · özet · `Tümünü gör`) ve beşinci bir düğme çizmiyor;
        sunucu kanalında sabitler zaten başlıktaki raptiye düğmesinden de açılıyor.
      */}
      {variant === "dm" ? (
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
      ) : null}
    </div>
  );
}
