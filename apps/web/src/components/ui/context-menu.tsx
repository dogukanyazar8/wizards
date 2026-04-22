"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ContextMenuProps = {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  position: {
    x: number;
    y: number;
  };
};

type ContextMenuItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  destructive?: boolean;
};

export function ContextMenu({ children, onClose, open, position }: ContextMenuProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = () => {
      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="app-overlay fixed z-[90] min-w-52 rounded-2xl p-1.5 shadow-2xl shadow-black/20 backdrop-blur-xl"
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
          style={{
            left: Math.min(position.x, window.innerWidth - 240),
            top: Math.min(position.y, window.innerHeight - 220),
          }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function ContextMenuItem({
  children,
  className,
  destructive,
  ...props
}: ContextMenuItemProps) {
  return (
    <button
      className={cn(
        "text-app-foreground flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[hsl(var(--surface-soft)/0.72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        destructive && "text-rose-300 hover:bg-rose-500/10",
        className,
      )}
      role="menuitem"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
