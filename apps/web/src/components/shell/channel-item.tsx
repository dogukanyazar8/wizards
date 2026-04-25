"use client";

import { motion } from "framer-motion";
import { Hash, Pencil, Trash2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ChannelItemProps = {
  active: boolean;
  canManage: boolean;
  name: string;
  onDelete: () => void;
  onEdit: () => void;
  onPrefetch?: () => void;
  onSelect: () => void;
  type: "TEXT" | "VOICE";
};

export function ChannelItem({
  active,
  canManage,
  name,
  onDelete,
  onEdit,
  onPrefetch,
  onSelect,
  type,
}: ChannelItemProps) {
  const Icon = type === "VOICE" ? Volume2 : Hash;

  return (
    <motion.div layout="position">
      <div
        className={cn(
          "group flex items-center gap-2 rounded-2xl px-2 py-1.5 transition",
          active
            ? "bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--foreground))]"
            : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-[hsl(var(--foreground))]",
        )}
      >
        <button
          aria-current={active ? "page" : undefined}
          aria-label={`Open ${type === "VOICE" ? "voice" : "text"} channel ${name}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
          onClick={onSelect}
          onFocus={onPrefetch}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSelect();
            }
          }}
          onMouseEnter={onPrefetch}
          type="button"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">{name}</span>
        </button>

        {canManage ? (
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              aria-label={`Edit channel ${name}`}
              className="text-app-muted rounded-lg p-1.5 transition hover:bg-[hsl(var(--surface-soft)/0.74)] hover:text-[hsl(var(--foreground))]"
              onClick={onEdit}
              type="button"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label={`Delete channel ${name}`}
              className="text-app-muted rounded-lg p-1.5 transition hover:bg-rose-500/10 hover:text-rose-300"
              onClick={onDelete}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
