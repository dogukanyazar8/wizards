"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useState } from "react";
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
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

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
        <>
          {isMobileViewport ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[89] bg-[hsl(var(--background)/0.48)] backdrop-blur-xs"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            />
          ) : null}
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              "app-overlay fixed z-[90] p-1.5 shadow-[0_20px_46px_hsl(var(--shadow-color)/0.16)] backdrop-blur-xl",
              isMobileViewport
                ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-[26px]"
                : "min-w-52 rounded-2xl",
            )}
            exit={
              isMobileViewport
                ? { opacity: 0, scale: 1, y: 18 }
                : { opacity: 0, scale: 0.96, y: -4 }
            }
            initial={
              isMobileViewport
                ? { opacity: 0, scale: 1, y: 18 }
                : { opacity: 0, scale: 0.96, y: -4 }
            }
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="menu"
            {...(isMobileViewport
              ? {}
              : {
                  style: {
                    left: Math.max(12, Math.min(position.x, window.innerWidth - 292)),
                    top: Math.max(12, Math.min(position.y, window.innerHeight - 360)),
                  },
                })}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </>
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
        "text-app-foreground flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[hsl(var(--surface-soft)/0.72)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        "min-h-11 md:min-h-0",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
        destructive &&
          "text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.12)] hover:text-[hsl(var(--danger))]",
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

export function ContextMenuSeparator() {
  return (
    <div
      className="my-1 h-px w-full bg-[linear-gradient(90deg,transparent,hsl(var(--border)/0.72),transparent)]"
      role="separator"
    />
  );
}
