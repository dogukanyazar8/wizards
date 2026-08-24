"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ModalProps = {
  children: React.ReactNode;
  className?: string;
  closeLabel?: string;
  description?: string;
  headerIcon?: React.ReactNode;
  hideHeader?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  overlayClassName?: string;
  title: string;
};

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function Modal({
  children,
  className,
  closeLabel = "Close modal",
  description,
  headerIcon,
  hideHeader = false,
  initialFocusRef,
  onClose,
  open,
  overlayClassName,
  title,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!mounted || !open) {
      return;
    }

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    (initialFocusRef?.current ?? focusable?.[0] ?? dialog)?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) {
        return;
      }

      const currentFocusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (currentFocusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      previousActiveElementRef.current?.focus();
    };
  }, [initialFocusRef, mounted, open]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          className={cn(
            "fixed inset-0 z-[80] flex items-end justify-center bg-[hsl(var(--background)/0.66)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:items-center sm:p-4",
            overlayClassName,
          )}
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-describedby={description ? descriptionId : undefined}
            aria-labelledby={titleId}
            aria-modal="true"
            className={cn(
              "app-overlay max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-[28px] p-5 shadow-[0_28px_70px_hsl(var(--shadow-color)/0.16)] backdrop-blur-2xl sm:rounded-[28px] sm:p-6",
              className,
            )}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            ref={dialogRef}
            tabIndex={-1}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {hideHeader ? (
              <h2 className="sr-only" id={titleId}>
                {title}
              </h2>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  {headerIcon ? <div className="shrink-0">{headerIcon}</div> : null}
                  <div className="min-w-0">
                    <h2 className="text-app-foreground text-xl font-semibold" id={titleId}>
                      {title}
                    </h2>
                    {description ? (
                      <p className="text-app-muted mt-1 text-sm" id={descriptionId}>
                        {description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <button
                  aria-label={closeLabel}
                  className="app-panel-soft text-app-muted flex min-h-11 min-w-11 items-center justify-center rounded-full border p-2 transition hover:opacity-90 hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:min-h-0 sm:min-w-0"
                  onClick={onClose}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className={hideHeader ? undefined : "mt-6"}>{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
