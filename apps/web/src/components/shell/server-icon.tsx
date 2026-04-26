"use client";

import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ServerIconProps = {
  active?: boolean;
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
  className,
  fallback,
  iconUrl,
  label,
  onClick,
  onContextMenu,
  onPrefetch,
}: ServerIconProps) {
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
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={cn(
          "group relative outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.7)]",
          className,
        )}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onFocus={onPrefetch}
        onMouseEnter={onPrefetch}
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
        <span className="app-tooltip pointer-events-none absolute left-full ml-3 z-50 max-w-[160px] truncate rounded-xl border px-2.5 py-1 text-xs opacity-0 shadow-[0_12px_26px_hsl(var(--shadow-color)/0.12)] transition group-hover:opacity-100">
          {label}
        </span>
      </motion.button>
    </div>
  );
}
