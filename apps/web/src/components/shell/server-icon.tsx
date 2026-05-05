"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
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
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPrefetch?: () => void;
  reorderable?: boolean;
  showLabel?: boolean;
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
  onClick,
  onContextMenu,
  onPrefetch,
  reorderable = false,
  showLabel = false,
}: ServerIconProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const preview = labelPreview ?? fallback;
  const resolvedIconSize = iconSize ?? (showLabel ? 40 : 48);
  const resolvedRowHeight = Math.max(56, resolvedIconSize + 14);

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
    <div className={cn("relative flex items-center justify-center", showLabel && "w-full")}>
      <motion.span
        animate={{
          opacity: active ? 1 : 0,
          scaleY: active ? 1 : 0.4,
        }}
        className={cn(
          "absolute rounded-full bg-[hsl(var(--primary))] shadow-[0_0_18px_hsl(var(--primary)/0.4)]",
          showLabel ? "-left-2 h-9 w-1" : "-left-3 h-10 w-1",
        )}
        transition={{ duration: 0.16 }}
      />

      <motion.button
        ref={buttonRef}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={cn(
          "group relative outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.7)]",
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
        type="button"
        whileHover={showLabel ? { scale: 1.018, x: 1 } : { scale: 1.06, y: -1 }}
        whileTap={showLabel ? { scale: 0.985 } : { scale: 0.97 }}
        {...(showLabel ? { style: { height: resolvedRowHeight } } : {})}
      >
        <Avatar
          alt={label}
          className={cn(
            "transition-all duration-200",
            active
              ? cn(
                  showLabel ? "rounded-[16px]" : "rounded-[18px]",
                  "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.18)] shadow-[0_16px_32px_hsl(var(--primary)/0.16)] ring-1 ring-[hsl(var(--primary)/0.24)]",
                )
              : cn(
                  showLabel ? "rounded-[18px]" : "rounded-[22px]",
                  "bg-[hsl(var(--surface-soft)/0.74)] shadow-[0_12px_26px_hsl(var(--shadow-color)/0.08)] group-hover:border-[hsl(var(--primary)/0.24)] group-hover:bg-[hsl(var(--surface-card)/0.9)]",
                  !showLabel && "group-hover:rounded-[18px]",
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
        {badgeCount > 0 ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inline-flex min-w-[1.35rem] items-center justify-center whitespace-nowrap rounded-full bg-[hsl(var(--danger))] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-[0_10px_22px_hsl(var(--danger)/0.35)]",
              showLabel
                ? "left-8 top-7"
                : "bottom-0 right-0 translate-x-[24%] translate-y-[18%]",
            )}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </motion.button>

      {tooltipPos !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className="app-tooltip pointer-events-none fixed z-[60] max-w-[160px] -translate-y-1/2 truncate rounded-xl border px-2.5 py-1 text-xs shadow-[0_12px_26px_hsl(var(--shadow-color)/0.12)]"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            {label}
          </span>,
          document.body,
        )}
    </div>
  );
}
