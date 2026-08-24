"use client";

import React, { useEffect, useRef } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { HOME_METRICS, HOME_TYPE_SCALE, pxToRem } from "@/lib/home/metrics";

/**
 * Sonsuz listenin alt sınırı — `07-faz6` §2.2, §7.
 *
 * `IntersectionObserver`, `scroll` dinleyicisi değil: kaydırma olayı saniyede
 * onlarca kez ana iş parçacığına düşer, kesişme gözlemcisi yalnız sınır görünür
 * olduğunda uyanır. Sanallaştırma **yok** — 25'lik sayfalar ve sonlu kullanım
 * için gereksiz (§2.2).
 *
 * Yükleniyor satırı `aria-live="polite"`: yeni satırların gelmesi görsel bir
 * olaydır ve klavye/ekran okuyucu kullanıcısı için sessizdir.
 */

export function ScreenInfiniteSentinel({
  hasMore,
  loading,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useI18n();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;

    if (!node || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      // Sayfanın sonuna varmadan önce istemeye başla: kullanıcı boş bir alta
      // bakmasın diye, ama ekranlar dolusu ileriden değil.
      { rootMargin: "200px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  return (
    <div
      className="flex items-center justify-center text-[hsl(var(--text-muted))]"
      data-testid="screen-infinite-sentinel"
      ref={sentinelRef}
      style={{
        fontSize: pxToRem(HOME_TYPE_SCALE.timestamp.size),
        minHeight: pxToRem(HOME_METRICS.sideScreens.contentGap),
        padding: `${pxToRem(HOME_METRICS.sideScreens.chipGap)} 0`,
      }}
    >
      <span aria-live="polite" role="status">
        {loading ? t("screens.list.loadingMore") : ""}
      </span>
    </div>
  );
}
