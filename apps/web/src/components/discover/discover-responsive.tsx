"use client";

import React, { useEffect } from "react";

import { DiscoverCategoryStrip } from "@/components/discover/discover-category-strip";
import { useI18n } from "@/components/providers/locale-provider";
import type { DiscoverCategory } from "@wizards/types";
import { DISCOVER_METRICS } from "@/lib/discover/metrics";
import type { DiscoverRouteState } from "@/lib/discover/routes";

export const DISCOVER_THEME_CONTRAST = {
  dark: {
    backgrounds: {
      base: [220, 8, 19],
      card: [220, 8, 22],
      panel: [220, 8, 20],
      soft: [220, 9, 26],
    },
    textMuted: [220, 8, 68],
  },
  light: {
    backgrounds: {
      base: [220, 23, 98],
      card: [0, 0, 100],
      panel: [220, 29, 96],
      soft: [220, 24, 91],
    },
    textMuted: [220, 11, 42],
  },
} as const;

export type DiscoverResponsiveState = {
  readonly categoryStrip: boolean;
  readonly directoryDrawer: boolean;
  readonly panelOverlay: boolean;
  readonly singleColumn: boolean;
};

export function selectDiscoverResponsiveState(width: number): DiscoverResponsiveState {
  return {
    categoryStrip: width < DISCOVER_METRICS.columns.directoryDrawerBelow,
    directoryDrawer: width < DISCOVER_METRICS.columns.directoryDrawerBelow,
    panelOverlay: width < DISCOVER_METRICS.columns.panelOverlayBelow,
    singleColumn: width < DISCOVER_METRICS.columns.singleColumnBelow,
  };
}

export function resolveDiscoverFocusWrapIndex(
  activeIndex: number,
  itemCount: number,
  backwards: boolean,
): number | null {
  if (itemCount === 0) {
    return null;
  }
  if (activeIndex < 0) {
    return backwards ? itemCount - 1 : 0;
  }
  if (backwards && activeIndex === 0) {
    return itemCount - 1;
  }
  if (!backwards && activeIndex === itemCount - 1) {
    return 0;
  }
  return null;
}

export function shouldTrapDiscoverPanelFocus(
  panelServerId: string | null,
  modal: DiscoverRouteState["modal"],
): boolean {
  return panelServerId !== null && modal === null;
}

export function buildDiscoverResponsiveCss(): string {
  return `
:root:not([class*="theme-"]) [data-discover-surface],
html.theme-light [data-discover-surface],
html.theme-dawn [data-discover-surface]{--text-muted:220 11% 42%}
[data-testid="discover-category-strip"],[data-testid="discover-profile-backdrop"]{display:none}
@media (max-width:1099px){
  @keyframes discover-panel-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
  [data-testid="server-profile-panel"]{position:fixed;inset-block:0;right:0;z-index:79;width:20.375rem;max-width:calc(100vw - 1rem);animation:discover-panel-in 160ms ease-out}
  [data-testid="discover-profile-backdrop"]{display:block;position:fixed;inset:0;z-index:78;border:0;background:hsl(var(--backdrop)/.4)}
}
@media (max-width:959px){
  [data-testid="discover-category-strip"]{display:flex}
}
@media (max-width:719px){
  [data-testid="discover-grid"] [data-layout="grid"],
  [data-testid="discover-card-skeleton"]{grid-template-columns:minmax(0,1fr)!important}
  [data-testid="discover-featured"]{flex-direction:column}
  [data-testid="discover-featured-actions"]{width:100%!important}
  [data-testid="discover-lane-group"]{flex:1 1 auto!important;min-width:0;max-width:100%;overflow-x:auto;scrollbar-width:thin}
}
@media (prefers-reduced-motion:reduce){
  [data-testid="discover-server-card"],
  [data-testid="discover-person-card"],
  [data-testid="discover-event-card"],
  [data-testid="server-profile-panel"]{animation:none!important;transition:none!important;transform:none!important}
}`.trim();
}

export type DiscoverResponsiveProps = {
  readonly categories: readonly DiscoverCategory[] | null;
  readonly onRequestPanelClose: () => void;
  readonly panelServerId: string | null;
  readonly route: DiscoverRouteState;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function DiscoverResponsive({
  categories,
  onRequestPanelClose,
  panelServerId,
  route,
}: DiscoverResponsiveProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!shouldTrapDiscoverPanelFocus(panelServerId, route.modal)) {
      return;
    }

    const media = window.matchMedia(
      `(max-width:${DISCOVER_METRICS.columns.panelOverlayBelow - 1}px)`,
    );
    let frame = 0;

    const getPanel = () =>
      document.querySelector<HTMLElement>('[data-testid="server-profile-panel"]');
    const focusFirst = () => {
      if (!media.matches) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        getPanel()?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!media.matches || event.key !== "Tab") {
        return;
      }
      const panel = getPanel();
      if (!panel) {
        return;
      }
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (item) => item.getClientRects().length > 0,
      );
      const nextIndex = resolveDiscoverFocusWrapIndex(
        items.indexOf(document.activeElement as HTMLElement),
        items.length,
        event.shiftKey,
      );
      if (nextIndex === null) {
        return;
      }
      event.preventDefault();
      items[nextIndex]?.focus();
    };
    const onMediaChange = () => focusFirst();

    focusFirst();
    document.addEventListener("keydown", onKeyDown, true);
    media.addEventListener("change", onMediaChange);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      document.removeEventListener("keydown", onKeyDown, true);
      media.removeEventListener("change", onMediaChange);
    };
  }, [panelServerId, route.modal]);

  return (
    <>
      <style>{buildDiscoverResponsiveCss()}</style>
      <DiscoverCategoryStrip categories={categories} route={route} />
      {panelServerId === null ? null : (
        <button
          aria-label={t("discover.profile.close")}
          data-testid="discover-profile-backdrop"
          onClick={onRequestPanelClose}
          type="button"
        />
      )}
    </>
  );
}
