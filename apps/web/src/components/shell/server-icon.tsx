"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { COMPACT_SERVER_RAIL_ICON_SIZE, COMPACT_SERVER_RAIL_TOUCH_SIZE } from "@/lib/appearance";
import { cn } from "@/lib/utils";

type ServerIconProps = {
  active?: boolean;
  badgeCount?: number;
  className?: string;
  fallback: string;
  iconSize?: number;
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
  const preview = labelPreview ?? fallback;
  const resolvedIconSize = iconSize ?? (showLabel ? 40 : COMPACT_SERVER_RAIL_ICON_SIZE);
  const resolvedTouchSize = showLabel
    ? Math.max(56, resolvedIconSize + 14)
    : Math.max(COMPACT_SERVER_RAIL_TOUCH_SIZE, resolvedIconSize + 8);

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
    <div className="relative flex w-full items-center justify-center">
      <motion.button
        ref={buttonRef}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={cn(
          "group relative outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.7)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--background)/0.72)]",
          !showLabel &&
            cn(
              "mx-auto flex items-center justify-center rounded-[16px] transition-all duration-150",
              active
                ? "bg-[hsl(var(--primary)/0.1)] shadow-[0_0_0_4px_hsl(var(--primary)/0.08)] ring-1 ring-[hsl(var(--primary)/0.28)]"
                : "hover:bg-[hsl(var(--primary)/0.08)]",
            ),
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
        whileHover={showLabel ? { scale: 1.018, x: 1 } : { scale: 1.035, y: -1 }}
        whileTap={showLabel ? { scale: 0.985 } : { scale: 0.97 }}
        style={{
          height: resolvedTouchSize,
          width: showLabel ? undefined : resolvedTouchSize,
        }}
      >
        <Avatar
          alt={label}
          className={cn(
            "transition-all duration-200",
            active
              ? cn(
                  showLabel ? "rounded-[15px]" : "rounded-[14px]",
                  "border-[hsl(var(--primary)/0.56)] bg-[hsl(var(--primary)/0.17)] shadow-[0_0_0_3px_hsl(var(--primary)/0.12)] ring-2 ring-[hsl(var(--primary)/0.34)]",
                )
              : cn(
                  showLabel ? "rounded-[16px]" : "rounded-[13px]",
                  "bg-[hsl(var(--surface-soft)/0.7)] shadow-none ring-1 ring-transparent group-hover:bg-[hsl(var(--surface-card)/0.86)] group-hover:ring-[hsl(var(--primary)/0.16)]",
                  !showLabel && "group-hover:rounded-[14px]",
                ),
          )}
          fallback={fallback}
          style={{
            height: resolvedIconSize,
            width: resolvedIconSize,
          }}
          src={iconUrl}
        />
        {showLabel ? (
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-app-foreground">
            {preview}
          </span>
        ) : null}
        {showLabel && reorderable ? (
          <GripVertical
            aria-hidden="true"
            className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground)/0.46)] opacity-0 transition group-hover:opacity-100"
          />
        ) : null}
        {mentionCount > 0 ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inline-flex min-w-[1.35rem] items-center justify-center whitespace-nowrap rounded-full border border-[hsl(var(--background)/0.5)] bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--ambient-1)))] px-1.5 py-0.5 text-[9px] font-black leading-none text-[hsl(var(--primary-foreground))] shadow-[0_8px_20px_hsl(var(--primary)/0.28)]",
              showLabel ? "left-8 top-7" : "bottom-0 right-0 translate-x-[24%] translate-y-[18%]",
            )}
            data-testid={testId ? `${testId}-mention-badge` : undefined}
          >
            @{mentionCount > 99 ? "99+" : mentionCount}
          </span>
        ) : badgeCount > 0 ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inline-flex min-w-[1.05rem] items-center justify-center whitespace-nowrap rounded-full border border-[hsl(var(--background)/0.42)] bg-[hsl(var(--danger)/0.92)] px-1 py-0.5 text-[9px] font-bold leading-none text-white shadow-[0_7px_16px_hsl(var(--danger)/0.24)]",
              showLabel ? "left-8 top-7" : "bottom-0 right-0 translate-x-[24%] translate-y-[18%]",
            )}
            data-testid={testId ? `${testId}-unread-badge` : undefined}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </motion.button>

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
