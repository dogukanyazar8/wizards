import React, { type CSSProperties } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { selectMessagesDensity } from "@/lib/messages/density";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

const { friends: metrics } = MESSAGES_METRICS;
const rowCount = selectMessagesDensity(1).friendRows;

function RouteSkeleton({ className, style }: { className?: string; style: CSSProperties }) {
  return <Skeleton className={cn("motion-reduce:animate-none", className)} style={style} />;
}

/**
 * `/messages/friends` RSC yüklenirken kabuğu yerinde tutan rota-yerel fallback.
 * Yakın sınır olmazsa App Router `(main)/loading.tsx` içindeki başlangıç ekranını
 * kullanır ve normal istemci gezintisi uygulama yeniden açılıyormuş gibi görünür.
 */
export default function MessagesFriendsLoading() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--surface-base))]"
      data-testid="messages-friends-route-loading"
    >
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex shrink-0 items-end justify-between"
          style={{
            borderBottom: `${hairline()} solid hsl(var(--border)/0.45)`,
            gap: pxToRem(metrics.headerGap),
            padding: `${pxToRem(metrics.headerPaddingTop)} ${pxToRem(
              metrics.headerPaddingX,
            )} ${pxToRem(metrics.headerPaddingBottom)}`,
          }}
        >
          <div className="min-w-0 flex-1">
            <RouteSkeleton style={{ height: pxToRem(metrics.titleFontSize), width: "9rem" }} />
            <div
              className="flex"
              style={{ gap: pxToRem(metrics.chipsGap), marginTop: pxToRem(metrics.chipsMarginTop) }}
            >
              {Array.from({ length: 3 }, (_unused, index) => (
                <RouteSkeleton
                  key={index}
                  style={{
                    borderRadius: pxToRem(metrics.chipRadius),
                    height: pxToRem(metrics.chipFontSize + metrics.chipPaddingY * 2),
                    width: index === 2 ? "6.5rem" : "5.5rem",
                  }}
                />
              ))}
            </div>
          </div>
          <RouteSkeleton
            className="shrink-0"
            style={{
              borderRadius: pxToRem(metrics.tabsRadius),
              height: pxToRem(metrics.tabHeight + metrics.tabsPadding * 2),
              width: "20rem",
            }}
          />
        </div>

        <div
          className="flex shrink-0"
          style={{
            gap: pxToRem(metrics.toolbarGap),
            padding: `${pxToRem(metrics.toolbarPaddingY)} ${pxToRem(metrics.toolbarPaddingX)}`,
          }}
        >
          <RouteSkeleton
            className="min-w-0 flex-1"
            style={{
              borderRadius: pxToRem(metrics.searchRadius),
              height: pxToRem(metrics.searchHeight),
            }}
          />
          <RouteSkeleton
            className="shrink-0"
            style={{
              borderRadius: pxToRem(metrics.sortRadius),
              height: pxToRem(metrics.sortHeight),
              width: "7rem",
            }}
          />
        </div>

        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={{
            padding: `0 ${pxToRem(metrics.listPaddingX)} ${pxToRem(metrics.listPaddingBottom)}`,
          }}
        >
          {Array.from({ length: rowCount }, (_unused, index) => (
            <div
              className="flex items-center"
              key={index}
              style={{
                gap: pxToRem(metrics.rowGap),
                padding: `${pxToRem(metrics.rowPaddingY)} ${pxToRem(metrics.rowPaddingX)}`,
              }}
            >
              <RouteSkeleton
                className="shrink-0 rounded-full"
                style={{
                  height: pxToRem(metrics.rowAvatarSize),
                  width: pxToRem(metrics.rowAvatarSize),
                }}
              />
              <div className="min-w-0 flex-1">
                <RouteSkeleton style={{ height: pxToRem(metrics.rowNameFontSize), width: "40%" }} />
                <RouteSkeleton
                  style={{
                    height: pxToRem(metrics.rowStatusFontSize),
                    marginTop: pxToRem(metrics.rowStatusMarginTop),
                    width: "62%",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
