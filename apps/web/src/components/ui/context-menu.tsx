"use client";

import { AnimatePresence, motion, type MotionStyle } from "framer-motion";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ContextMenuProps = {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  position?: {
    x: number;
    y: number;
  };
  /**
   * Nereye çizileceği.
   *
   * - `viewport` (varsayılan): gövdeye portallanır, `position` bir **görünüm alanı**
   *   koordinatıdır ve kabuk kendi yüzeyini (`app-overlay`, `min-w-52`, `rounded-2xl`)
   *   getirir. Satır menüleri ve sağ tık menüleri bunu kullanır.
   * - `anchor`: menü tetikleyicinin yanında, `position: relative` bir sarmalayıcının
   *   **içinde** çizilir; portal yok, `position` okunmaz. SPEC-MESAJLAR §17 başlık
   *   menüsünü `top:41px; right:0` ile tetikleyiciye bağlıyor ve kendi genişliğini
   *   (254 / 262), yarıçapını (17) ve gölgesini taşıyor — portallanan bir kabuk bunu
   *   ancak görünüm alanı matematiğiyle taklit edebilirdi ve pencere yeniden
   *   boyutlandığında kayardı. Yüzey `className` / `style` ile dışarıdan verilir.
   *
   * Klavye ve kapanma sözleşmesi iki modda **aynı**: açılışta ilk öğeye focus,
   * kapanışta tetikleyiciye dönüş, `Tab` menünün içinde döner, `Esc` ve dış tıklama
   * kapatır.
   */
  placement?: "viewport" | "anchor";
  className?: string;
  style?: React.CSSProperties;
  /** `anchor` modunda kabuğun erişilebilir adı; menünün neyi yönettiğini söyler. */
  label?: string;
  testId?: string;
};

type ContextMenuItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  destructive?: boolean;
  /**
   * Satırın kendisine erişim. Alt menüsü olan bir satır kapanışta odağı **geri**
   * almak zorunda; ref olmadan `Esc`ten sonra odak belgenin başına düşerdi.
   */
  ref?: React.Ref<HTMLButtonElement>;
};

/**
 * Odak halkasındaki her öğe.
 *
 * `menuitemradio` ve `menuitemcheckbox` da menü öğesidir; seçilebilir bir satırı
 * `menuitem` yapmak ekran okuyucuya seçili olup olmadığını söylemez, ama seçiciyi
 * dar tutmak da o satırı `Tab` turunun dışında bırakırdı.
 */
const MENU_ITEM_SELECTOR = '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]';

export function ContextMenu({
  children,
  className,
  label,
  onClose,
  open,
  placement = "viewport",
  position = { x: 0, y: 0 },
  style,
  testId,
}: ContextMenuProps) {
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Measure the actual menu: translations, text scaling and permissions change its size.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || placement !== "viewport" || !menu) return;
    if (isMobileViewport) {
      menu.style.removeProperty("left");
      menu.style.removeProperty("top");
      return;
    }

    const positionMenu = () => {
      const topInset =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--app-viewport-top"),
        ) || 0;
      menu.style.left = `${Math.max(12, Math.min(position.x, window.innerWidth - menu.offsetWidth - 12))}px`;
      menu.style.top = `${Math.max(topInset + 12, Math.min(position.y, window.innerHeight - menu.offsetHeight - 12))}px`;
    };
    positionMenu();
    const observer = new ResizeObserver(positionMenu);
    observer.observe(menu);
    window.addEventListener("resize", positionMenu);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionMenu);
    };
  }, [open, placement, position.x, position.y, isMobileViewport]);

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

  /**
   * Klavye sözleşmesi (`00-ortak-baglam` §5.3): açılışta ilk öğeye focus, kapanışta
   * tetikleyiciye dönüş. Menü portalda çiziliyor, yani focus taşınmazsa klavye kullanıcısı
   * menüyü hiç göremez; geri dönüş olmazsa da `Esc` sonrası focus belgenin başına düşer.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const firstItem = menuRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR);
    firstItem?.focus();

    return () => {
      triggerRef.current?.focus();
      triggerRef.current = null;
    };
  }, [open]);

  /**
   * Menü açıkken `Tab` menünün içinde döner; arka plana kaçan bir odak kalmaz.
   *
   * Yukarı/aşağı oklar da aynı halkayı sürer: bir menüyü klavyeyle gezmenin beklenen
   * yolu ok tuşlarıdır (`role="menu"` bunu vaat eder) ve yalnız `Tab` çalıştığında
   * kullanıcı ilk okta menünün ölü olduğunu sanır.
   */
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const backwards = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey);
    const forwards = event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey);

    if (!backwards && !forwards) {
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [],
    ).filter((item) => !item.hasAttribute("disabled"));

    if (items.length === 0) {
      return;
    }

    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = (current + (backwards ? -1 : 1) + items.length) % items.length;

    event.preventDefault();
    items[next]?.focus();
  };

  /**
   * Bağlı menü portala girmez: sarmalayıcısının içinde, `position:absolute` ile durur.
   * Sunucuda da çizilir — portallanan kol `document` olmadan `null` döner ve bu, menüyü
   * statik işaretlemeyle sınayan her testi boş bir dizeyle baş başa bırakırdı.
   */
  if (placement === "anchor") {
    if (!open) {
      return null;
    }

    return (
      <div
        aria-label={label}
        className={cn("absolute", className)}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleMenuKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        ref={menuRef}
        role="menu"
        style={style}
      >
        {children}
      </div>
    );
  }

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
              "app-overlay fixed z-[90] max-h-[calc(100dvh-var(--app-viewport-top,0px)-24px)] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain p-1.5 shadow-[0_20px_46px_hsl(var(--shadow-color)/0.16)] backdrop-blur-xl",
              isMobileViewport
                ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-[26px]"
                : "min-w-52 rounded-2xl",
              className,
            )}
            aria-label={label}
            data-testid={testId}
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
            onKeyDown={handleMenuKeyDown}
            ref={menuRef}
            role="menu"
            style={style as MotionStyle}
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

export function ContextMenuSeparator({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
} = {}) {
  return (
    <div
      className={cn(
        "my-1 h-px w-full bg-[linear-gradient(90deg,transparent,hsl(var(--border)/0.72),transparent)]",
        className,
      )}
      role="separator"
      style={style}
    />
  );
}
