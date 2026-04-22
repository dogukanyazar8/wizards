"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ModalProps = {
  children: React.ReactNode;
  className?: string;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function Modal({ children, className, description, onClose, open, title }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
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
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[hsl(var(--background)/0.66)] p-4 backdrop-blur-md"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              "app-overlay w-full max-w-lg rounded-[28px] p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl",
              className,
            )}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-describedby={description ? "modal-description" : undefined}
            aria-modal="true"
            aria-labelledby="modal-title"
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-app-foreground text-xl font-semibold" id="modal-title">
                  {title}
                </h2>
                {description ? (
                  <p className="text-app-muted mt-1 text-sm" id="modal-description">
                    {description}
                  </p>
                ) : null}
              </div>

              <button
                aria-label="Close modal"
                className="app-panel-soft text-app-muted rounded-full border p-2 transition hover:opacity-90 hover:text-[hsl(var(--foreground))]"
                onClick={onClose}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
