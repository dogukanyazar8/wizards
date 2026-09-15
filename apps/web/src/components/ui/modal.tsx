"use client";

import { AnimatePresence, motion, type MotionStyle } from "framer-motion";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { WindowCloseButton } from "@/components/ui/window-close-button";

type ModalProps = {
  children: React.ReactNode;
  className?: string;
  closeLabel?: string;
  description?: string;
  headerIcon?: React.ReactNode;
  hideHeader?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null> | undefined;
  onClose: () => void;
  open: boolean;
  overlayClassName?: string;
  /**
   * SPEC-SUNUCU §6 — sunucu pencereleri kart ölçüsünü, yarıçapını ve gölgesini
   * `SERVER_METRICS`'ten okur; bunlar rem cinsinden hesaplanan değerlerdir ve bir Tailwind
   * sınıfına sığmaz. Satır içi olmaları aynı zamanda `app-overlay`in zemin rengini de kesin
   * olarak ezer.
   */
  overlayStyle?: React.CSSProperties | undefined;
  style?: React.CSSProperties | undefined;
  title: string;
};

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

// Native querySelectorAll cannot see controls inside web components such as Emoji Mart.
// Traverse open shadow roots in document order so Tab can enter and leave those controls.
function getModalFocusableElements(root: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const visit = (parent: Element | ShadowRoot) => {
    for (const child of parent.children) {
      if (child.matches("[hidden], [inert]")) continue;
      if (
        child instanceof HTMLElement &&
        child.tabIndex >= 0 &&
        !child.matches(":disabled") &&
        child.getClientRects().length > 0 &&
        getComputedStyle(child).visibility !== "hidden"
      ) {
        elements.push(child);
      }
      visit(child.shadowRoot ?? child);
    }
  };
  visit(root);
  return elements;
}

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
  overlayStyle,
  style,
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
    const focusable = dialog ? getModalFocusableElements(dialog) : [];

    (initialFocusRef?.current ?? focusable?.[0] ?? dialog)?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      // Portalled child dialogs own their keyboard events. Parent dialogs must
      // neither close nor move focus when the child handles Escape or Tab.
      if (
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        event.target.closest('[role="dialog"]') !== dialog
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) {
        return;
      }

      const currentFocusable = getModalFocusableElements(dialog);

      if (currentFocusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const activeElement = event.composedPath()[0] ?? document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && activeElement === last) {
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
            "fixed inset-x-0 bottom-0 top-[var(--app-viewport-top,0px)] z-[100] flex min-h-0 min-w-0 items-end justify-center bg-[hsl(var(--background)/0.66)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:items-center sm:p-4",
            overlayClassName,
          )}
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onClose}
          {...(overlayStyle ? { style: overlayStyle as MotionStyle } : {})}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-describedby={description ? descriptionId : undefined}
            aria-labelledby={titleId}
            aria-modal="true"
            className={cn(
              "app-overlay min-h-0 min-w-0 max-h-full w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[28px] p-5 shadow-[0_28px_70px_hsl(var(--shadow-color)/0.16)] backdrop-blur-2xl sm:rounded-[28px] sm:p-6",
              className,
            )}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            ref={dialogRef}
            tabIndex={-1}
            {...(style ? { style: style as MotionStyle } : {})}
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

                <WindowCloseButton aria-label={closeLabel} onClick={onClose} />
              </div>
            )}

            {hideHeader ? children : <div className="mt-6">{children}</div>}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
