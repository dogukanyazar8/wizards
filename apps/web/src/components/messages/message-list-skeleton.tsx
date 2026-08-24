import React from "react";

import { MESSAGES_METRICS, pxToRem } from "@/lib/messages/metrics";

/**
 * Mesaj listesi iskeleti — SPEC-MESAJLAR §10 (yükleme).
 *
 * Eski hâl ortada duran tek bir `Yükleniyor…` satırıydı: liste yüklenirken
 * yüzey boş kalıyor, mesajlar gelince yerleşim bir anda zıplıyordu. İskelet
 * gerçek satırın **ölçüsünü** taşıyor (aynı avatar boyu, aynı satır boşluğu,
 * aynı yatay padding), bu yüzden veri geldiğinde yerinden oynayan bir şey
 * olmuyor.
 *
 * Genişlikler sabit ve deterministik: rastgele üretilen genişlikler her
 * render'da değişir, testlerde ölçülemez ve `prefers-reduced-motion` altında
 * bile gözle titreşir.
 */

const { messageList } = MESSAGES_METRICS;

/** Satır başına gövde çizgisi genişlikleri (yüzde). */
const ROW_SHAPES: readonly (readonly number[])[] = [[72, 44], [58], [86, 61], [49], [78, 38], [64]];

export const MESSAGE_LIST_SKELETON_ROWS = ROW_SHAPES.length;

function SkeletonBar({ height, radius, width }: { height: number; radius: number; width: string }) {
  return (
    <span
      className="block bg-[hsl(var(--surface-soft))]"
      style={{ borderRadius: pxToRem(radius), height: pxToRem(height), width }}
    />
  );
}

export function MessageListSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse flex-col motion-reduce:animate-none"
      data-testid="message-list-skeleton"
      style={{
        gap: pxToRem(messageList.rowGap),
        paddingBottom: pxToRem(messageList.paddingBottom),
        paddingLeft: pxToRem(messageList.rowPaddingX),
        paddingRight: pxToRem(messageList.rowPaddingX),
        paddingTop: pxToRem(messageList.paddingTop),
      }}
    >
      {ROW_SHAPES.map((lines, rowIndex) => (
        <div
          className="flex items-start"
          data-testid="message-list-skeleton-row"
          key={rowIndex}
          style={{ gap: pxToRem(messageList.authorGap) }}
        >
          <SkeletonBar
            height={messageList.avatarSize}
            radius={messageList.avatarSize / 2}
            width={pxToRem(messageList.avatarSize)}
          />

          <div
            className="flex min-w-0 flex-1 flex-col"
            style={{ gap: pxToRem(messageList.bodyMarginTop) }}
          >
            <SkeletonBar height={messageList.authorFontSize} radius={6} width="9.5rem" />
            {lines.map((width, lineIndex) => (
              <SkeletonBar
                height={messageList.bodyFontSize}
                key={lineIndex}
                radius={6}
                width={`${width}%`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
