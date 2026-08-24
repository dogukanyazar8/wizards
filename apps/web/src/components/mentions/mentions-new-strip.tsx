"use client";

import React from "react";
import { ArrowUp } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { MENTIONS_METRICS, pxToRem } from "@/lib/mentions/metrics";

/**
 * `{count} yeni bahsetme` şeridi — PROMPT §4.
 *
 * Kaydırılmış bir akışa yeni kart girdiğinde kullanıcının baktığı yer bozulmaz: kart listeye
 * eklenir, kaydırma konumu ölçülerek telafi edilir ve gelen kartın **varlığı** bu şeritle
 * duyurulur. Kullanıcı hazır olduğunda tıklar ve en üste gider.
 *
 * Tasarım altlığında bu şeridin karşılığı yok (referans dosya canlı olay taşımıyor). Ölçüler
 * bu yüzden başlığın segment sözlüğünden ödünç alındı — yeni sayı uydurmak, ekranda ikinci bir
 * ölçü dili açardı. Sapma rapora yazıldı.
 */

const { cardMenu, feed, feedHeader, sidebar } = MENTIONS_METRICS;

/**
 * Şerit kart menüsünün **altında** durur. Menü sözlükte 5; yapışkan şerit ondan bir kademe
 * aşağıda ama kartların (yığın sırası `auto`) üstünde. Tersi olsaydı üçüncü ve sonraki
 * kartların yukarı açılan menüsü şeridin altında kalırdı.
 */
const STRIP_Z_INDEX = cardMenu.zIndex - 1;

export type MentionsNewStripProps = {
  readonly count: number;
  readonly onClick: () => void;
};

export function MentionsNewStrip({ count, onClick }: MentionsNewStripProps) {
  const { t } = useI18n();

  if (count <= 0) {
    return null;
  }

  return (
    <div
      // Kap saydam ve tam genişlikte; `pointer-events` bırakılmasaydı akışın tepesinde
      // butonun iki yanında ölü bir bant kalır ve altındaki kartın eylemleri tıklanamazdı.
      className="pointer-events-none sticky top-0 flex justify-center"
      style={{ paddingBottom: pxToRem(feed.gap), zIndex: STRIP_Z_INDEX }}
    >
      <button
        className="pointer-events-auto flex items-center bg-[hsl(var(--primary))] text-white transition-[filter] hover:brightness-[1.08] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        data-testid="mentions-new-strip"
        onClick={onClick}
        style={{
          borderRadius: pxToRem(feedHeader.countPillRadius),
          // Birincil butonun gölgesi rayın `Tümünü okundu işaretle` butonuyla aynı; iki
          // birincil buton aynı yüzeyde farklı gölge taşımamalı.
          boxShadow: `${pxToRem(sidebar.markAllShadow.x)} ${pxToRem(
            sidebar.markAllShadow.y,
          )} ${pxToRem(sidebar.markAllShadow.blur)} ${pxToRem(
            sidebar.markAllShadow.spread,
          )} hsl(var(--primary))`,
          fontSize: pxToRem(feedHeader.tabFontSize),
          fontWeight: feedHeader.tabWeight,
          gap: pxToRem(feedHeader.tabGap),
          height: pxToRem(feedHeader.tabHeight),
          lineHeight: 1,
          padding: `0 ${pxToRem(feedHeader.tabPaddingX)}`,
          transitionDuration: `${sidebar.transitionMs}ms`,
        }}
        type="button"
      >
        <ArrowUp
          aria-hidden="true"
          style={{ height: pxToRem(feedHeader.iconSize), width: pxToRem(feedHeader.iconSize) }}
        />
        {t("mentions.feed.newStrip", { count })}
      </button>
    </div>
  );
}
