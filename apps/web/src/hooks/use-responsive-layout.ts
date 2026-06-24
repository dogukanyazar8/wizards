"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getResponsiveLayoutMode,
  RESPONSIVE_BREAKPOINTS,
  shouldUseInfoDrawer,
  shouldUseWorkspaceDrawer,
  type ResponsiveLayoutMode,
} from "@/lib/responsive";

function getViewportWidth() {
  if (typeof window === "undefined") {
    return RESPONSIVE_BREAKPOINTS.supportPanel;
  }

  return Math.round(window.visualViewport?.width ?? window.innerWidth);
}

function subscribeToViewport(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("resize", callback);
  window.visualViewport?.addEventListener("resize", callback);

  return () => {
    window.removeEventListener("resize", callback);
    window.visualViewport?.removeEventListener("resize", callback);
  };
}

export function useResponsiveLayout(): {
  isDesktop: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isWideDesktop: boolean;
  mode: ResponsiveLayoutMode;
  shouldMountInfoDrawer: boolean;
  shouldMountDesktopSupportPanel: boolean;
  shouldMountWorkspaceDrawer: boolean;
  viewportWidth: number;
} {
  const viewportWidth = useSyncExternalStore(
    subscribeToViewport,
    getViewportWidth,
    () => RESPONSIVE_BREAKPOINTS.supportPanel,
  );
  const mode = getResponsiveLayoutMode(viewportWidth);
  const isWideDesktop = viewportWidth >= RESPONSIVE_BREAKPOINTS.supportPanel;

  return {
    isDesktop: mode === "desktop",
    isMobile: mode === "mobile",
    isTablet: mode === "tablet",
    isWideDesktop,
    mode,
    shouldMountInfoDrawer: shouldUseInfoDrawer(mode),
    shouldMountDesktopSupportPanel: isWideDesktop,
    shouldMountWorkspaceDrawer: shouldUseWorkspaceDrawer(mode),
    viewportWidth,
  };
}

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [locked]);
}
