"use client";

import React, { createContext, useContext, useEffect } from "react";

const SettingsSearchHighlightContext = createContext<string | null>(null);

export function SettingsSearchHighlightProvider({
  children,
  rowKey,
}: {
  readonly children: React.ReactNode;
  readonly rowKey: string | null;
}) {
  return (
    <SettingsSearchHighlightContext.Provider value={rowKey}>
      {children}
    </SettingsSearchHighlightContext.Provider>
  );
}

export function useSettingsSearchHighlight(
  rowKey: string,
  ref: React.RefObject<HTMLElement | null>,
): boolean {
  const targetRowKey = useContext(SettingsSearchHighlightContext);
  const highlighted = targetRowKey === rowKey;

  useEffect(() => {
    if (!highlighted) return;

    const frame = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlighted, ref]);

  return highlighted;
}
