"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ServerIconProps = {
  active?: boolean;
  badgeCount?: number;
  className?: string;
  fallback: string;
  iconUrl?: string | null;
  label: string;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPrefetch?: () => void;
};

export function ServerIcon({
  active,
  badgeCount = 0,
  className,
  fallback,
  iconUrl,
  label,
  onClick,
  onContextMenu,
  onPrefetch,
}: ServerIconProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

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
    <div className="relative flex items-center justify-center">
      <motion.span
        animate={{
          opacity: active ? 1 : 0,
          scaleY: active ? 1 : 0.4,
        }}
        className="absolute -left-3 h-10 w-1 rounded-full bg-[hsl(var(--primary))]"
        transition={{ duration: 0.16 }}
      />

      <motion.button
        ref={buttonRef}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={cn(
          "group relative outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.7)]",
          className,
        )}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onFocus={() => {
          onPrefetch?.();
          showTooltip();
        }}
        onBlur={hideTooltip}
        onMouseEnter={() => {
          onPrefetch?.();
          showTooltip();
        }}
        onMouseLeave={hideTooltip}
        type="button"
        whileHover={{ scale: 1.06, y: -1 }}
        whileTap={{ scale: 0.97 }}
        >
        <Avatar
          alt={label}
          className={cn(
            "h-12 w-12 transition-all duration-200",
            active
              ? "rounded-[18px] border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.18)]"
              : "rounded-[22px] group-hover:rounded-[18px]",
          )}
          fallback={fallback}
          src={iconUrl}
        />
        {badgeCount > 0 ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 inline-flex min-w-[1.35rem] translate-x-[24%] translate-y-[18%] items-center justify-center whitespace-nowrap rounded-full bg-[hsl(var(--danger))] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-[0_10px_22px_hsl(var(--danger)/0.35)]"
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
