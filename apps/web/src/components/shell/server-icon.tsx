"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import type { ServerIconTone } from "@wizards/types";
import { Avatar } from "@/components/ui/avatar";
import { SERVER_RAIL_ICON_SIZE, SERVER_RAIL_TOUCH_SIZE } from "@/lib/appearance";
import { HOME_METRICS, pxToRem } from "@/lib/home/metrics";
import { getServerIconToneColor } from "@/lib/servers/server-icon-tone";
import {
  resolveServerAbbreviation,
  resolveServerIconPresentation,
} from "@/lib/servers/server-icon-presentation";
import { cn } from "@/lib/utils";

const { rail } = HOME_METRICS;

/** Ray rozetinin metni; iki temada da beyaz olan tek token (§1 "yeni renk yok"). */
const ON_ACCENT_COLOR = "hsl(var(--primary-foreground))";

/** SPEC §2.1 — okunmamış rozeti: 17×17, yarıçap 6, danger, 2px `--surface-rail` kenar. */
const RAIL_BADGE_STYLE = {
  background: "hsl(var(--danger))",
  border: `${pxToRem(rail.badgeBorderWidth)} solid hsl(var(--surface-rail))`,
  borderRadius: pxToRem(rail.badgeRadius),
  color: ON_ACCENT_COLOR,
  fontSize: pxToRem(rail.badgeFontSize),
  fontWeight: 600,
  height: pxToRem(rail.badgeHeight),
  lineHeight: 1,
  minWidth: pxToRem(rail.badgeMinWidth),
  padding: `0 ${pxToRem(rail.badgePaddingX)}`,
  right: pxToRem(rail.badgeOffsetRight),
  top: pxToRem(rail.badgeOffsetTop),
} as const;

const DISPLAY_FONT = "[font-family:var(--font-display),sans-serif]";

type ServerIconProps = {
  active?: boolean;
  badgeCount?: number;
  className?: string;
  fallback: string;
  iconSize?: number;
  iconColor?: ServerIconTone | null;
  iconUrl?: string | null;
  label: string;
  labelPreview?: string;
  mentionCount?: number;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPrefetch?: () => void;
  reorderable?: boolean;
  showLabel?: boolean;
  testId?: string;
  tooltipHint?: string | undefined;
};

export function ServerIcon({
  active,
  badgeCount = 0,
  className,
  fallback,
  iconSize,
  iconColor,
  iconUrl,
  label,
  labelPreview,
  mentionCount = 0,
  onClick,
  onContextMenu,
  onPrefetch,
  reorderable = false,
  showLabel = false,
  testId,
  tooltipHint,
}: ServerIconProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const resolvedIconSize = iconSize ?? (showLabel ? 40 : SERVER_RAIL_ICON_SIZE);
  // Rayın ikon kutusu tıklama hedefinin kendisidir (44); çevresine pay eklenmez (§2.1).
  const resolvedTouchSize = showLabel
    ? Math.max(56, resolvedIconSize + 14)
    : Math.max(SERVER_RAIL_TOUCH_SIZE, resolvedIconSize);
  const presentation = resolveServerIconPresentation({
    iconColor,
    iconUrl,
    name: fallback,
    shortName: labelPreview ?? null,
  });
  const fallbackLabel = resolveServerAbbreviation(fallback, labelPreview ?? null);

  const showTooltip = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setTooltipPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const hideTooltip = () => setTooltipPos(null);

  useEffect(() => () => setTooltipPos(null), []);

  return (
    <div
      className="relative flex w-full items-center justify-center"
      style={showLabel ? undefined : { padding: `${pxToRem(rail.itemPaddingY)} 0` }}
    >
      {/* SPEC §2.1 — aktif sunucunun sol seçim çubuğu: 4.5×34, yalnız sağ ucu yuvarlak. */}
      {active && !showLabel ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 bg-[hsl(var(--primary))]"
          style={{
            borderRadius: `0 ${pxToRem(rail.activeIndicatorRadiusEnd)} ${pxToRem(
              rail.activeIndicatorRadiusEnd,
            )} 0`,
            height: pxToRem(rail.activeIndicatorHeight),
            width: pxToRem(rail.activeIndicatorWidth),
          }}
        />
      ) : null}
      <motion.button
        ref={buttonRef}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={cn(
          "group relative outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.7)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background)/0.72)]",
          !showLabel &&
            "mx-auto flex items-center justify-center transition-transform duration-150",
          showLabel &&
            "flex w-full items-center gap-2.5 rounded-[22px] border px-2.5 text-left transition-all duration-200",
          showLabel && reorderable && "pr-5",
          showLabel &&
            (active
              ? "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.13)] shadow-[0_18px_36px_hsl(var(--primary)/0.1)]"
              : "border-transparent bg-transparent hover:border-[hsl(var(--border)/0.58)] hover:bg-[hsl(var(--surface-soft)/0.36)]"),
          className,
        )}
        onBlur={hideTooltip}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onFocus={() => {
          onPrefetch?.();
          showTooltip();
        }}
        onMouseEnter={() => {
          onPrefetch?.();
          showTooltip();
        }}
        onMouseLeave={hideTooltip}
        data-testid={testId}
        type="button"
        whileHover={
          showLabel ? { scale: 1.018, x: 1 } : active ? {} : { y: -HOME_METRICS.motion.hoverLift }
        }
        whileTap={showLabel ? { scale: 0.985 } : { scale: 0.97 }}
        style={{
          borderRadius: showLabel ? undefined : pxToRem(rail.iconRadius),
          height: showLabel ? resolvedTouchSize : pxToRem(resolvedTouchSize),
          width: showLabel ? undefined : pxToRem(resolvedTouchSize),
        }}
      >
        {presentation.kind === "image" ? (
          <Avatar
            alt={label}
            className={cn(
              "transition-all duration-200",
              showLabel && (active ? "rounded-[15px]" : "rounded-[16px]"),
              active
                ? "border-[hsl(var(--primary)/0.56)] bg-[hsl(var(--primary)/0.17)]"
                : "bg-[hsl(var(--surface-soft)/0.7)] ring-1 ring-transparent",
            )}
            fallback={fallbackLabel}
            style={{
              borderRadius: showLabel ? undefined : pxToRem(rail.iconRadius),
              height: showLabel ? resolvedIconSize : pxToRem(resolvedIconSize),
              width: showLabel ? resolvedIconSize : pxToRem(resolvedIconSize),
            }}
            src={presentation.imageUrl}
          />
        ) : (
          /* SPEC §2.1 — ikonsuz sunucu: 44×44 kutu, baş harf 600/15 display. Aktif olan dolu
             `--primary`, diğerleri kimlikten türeyen tint. */
          <span
            aria-hidden="true"
            className={cn(DISPLAY_FONT, "grid place-items-center uppercase transition-colors")}
            style={{
              background: getServerIconToneColor(presentation.tone, active ? undefined : 0.16),
              borderRadius: pxToRem(rail.iconRadius),
              color: active ? ON_ACCENT_COLOR : getServerIconToneColor(presentation.tone),
              fontSize: pxToRem(rail.iconFontSize),
              fontWeight: 600,
              height: pxToRem(resolvedIconSize),
              lineHeight: 1,
              width: pxToRem(resolvedIconSize),
            }}
          >
            {presentation.label}
          </span>
        )}
        {showLabel ? (
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-app-foreground">
            {fallbackLabel}
          </span>
        ) : null}
        {showLabel && reorderable ? (
          <GripVertical
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground)/0.46)] opacity-0 transition group-hover:opacity-100"
          />
        ) : null}
      </motion.button>

      {/* SPEC §2.1: rozet ikon kutusunun değil, ray satırının sağ üstüne oturur (`top:1 right:12`).
          Bahsedilme rozeti aynı geometriyi taşır, yalnız metni "@n"dir. */}
      {mentionCount > 0 ? (
        <span
          aria-hidden="true"
          className={cn(DISPLAY_FONT, "pointer-events-none absolute grid place-items-center")}
          data-testid={testId ? `${testId}-mention-badge` : undefined}
          style={RAIL_BADGE_STYLE}
        >
          @{mentionCount > 99 ? "99+" : mentionCount}
        </span>
      ) : badgeCount > 0 ? (
        <span
          aria-hidden="true"
          className={cn(DISPLAY_FONT, "pointer-events-none absolute grid place-items-center")}
          data-testid={testId ? `${testId}-unread-badge` : undefined}
          style={RAIL_BADGE_STYLE}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}

      {tooltipPos !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className="app-tooltip pointer-events-none fixed z-[60] max-w-[190px] -translate-y-1/2 rounded-xl border px-2.5 py-1.5 text-xs shadow-[0_12px_26px_hsl(var(--shadow-color)/0.12)]"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            <span className="block truncate font-semibold text-app-foreground">{label}</span>
            {tooltipHint ? (
              <span className="mt-0.5 block truncate text-[11px] font-medium text-app-muted">
                {tooltipHint}
              </span>
            ) : null}
          </span>,
          document.body,
        )}
    </div>
  );
}
