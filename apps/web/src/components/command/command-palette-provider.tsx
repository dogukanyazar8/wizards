"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";

import { isCommandPaletteShortcut } from "@/lib/home/command-palette";

/**
 * Komut paletinin açılış katmanı — `06-faz5` §5.1 ve §9.
 *
 * **Tek global dinleyici.** Kısayolu her bileşenin kendi başına kurması §9'un
 * yasakladığı şey: iki dinleyici iki palet açar. Buradaki `keydown` uygulamanın
 * tamamı için tek kayıttır ve `isCommandPaletteShortcut` yazarken tetiklenmesini
 * engeller.
 *
 * Palet açıkken `⌘K` **kapatır** — ikinci bir palet açılmaz, çünkü açılış tek bir
 * boolean'dır ve dinleyici onu ters çevirir.
 *
 * Bileşen `dynamic()` ile bölünüyor (§5.2 bundle bütçesi): palet açılmadan ne
 * bileşen ne de arama sorgusu yükleniyor.
 */

const CommandPalette = dynamic(
  () => import("@/components/command/command-palette").then((module) => module.CommandPalette),
  { ssr: false },
);

export type CommandPaletteContextValue = {
  readonly close: () => void;
  readonly isOpen: boolean;
  readonly open: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({
  children,
  onOpenCreateServer,
  onOpenSettings,
}: {
  children: ReactNode;
  onOpenCreateServer: () => void;
  onOpenSettings: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  /** Where focus goes back to on close (§5.2) — the search field or the shortcut's origin. */
  const triggerRef = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCommandPaletteShortcut(event)) {
        return;
      }

      event.preventDefault();

      if (isOpen) {
        close();
        return;
      }

      open();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isOpen, open]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ close, isOpen, open }),
    [close, isOpen, open],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {isOpen ? (
        <CommandPalette
          onClose={close}
          onOpenCreateServer={onOpenCreateServer}
          onOpenSettings={onOpenSettings}
        />
      ) : null}
    </CommandPaletteContext.Provider>
  );
}

/**
 * Returns `null` outside the shell (the login surfaces mount no palette), so a
 * caller can render its trigger without a provider and simply do nothing.
 */
export function useCommandPalette(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext);
}
