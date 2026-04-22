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
};

export function ServerIcon({
  active,
  className,
  fallback,
  iconUrl,
  label,
  onClick,
  onContextMenu,
}: ServerIconProps) {
  return (
    <div className="relative flex items-center justify-center">
      <motion.span
        animate={{
          opacity: active ? 1 : 0,
          scaleY: active ? 1 : 0.4,
        }}
        className="absolute -left-3 h-10 w-1 rounded-full bg-sky-400"
        transition={{ duration: 0.16 }}
      />

      <motion.button
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={cn("group relative outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70", className)}
        onClick={onClick}
        onContextMenu={onContextMenu}
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
      </motion.button>
    </div>
  );
}
