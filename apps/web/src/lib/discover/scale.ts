"use client";

import { useSyncExternalStore } from "react";

import {
  selectUiScale,
  type UiScalePlatform,
  type UiScaleValue,
  type UiScaleViewport,
} from "@/lib/home/scale";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

export const DISCOVER_PAGE_SIZES = Object.freeze({
  1: 24,
  1.15: 24,
  1.5: 36,
  2: 48,
} as const satisfies Readonly<Record<UiScaleValue, 24 | 36 | 48>>);

export function selectDiscoverPageSizeForScale(scale: UiScaleValue): 24 | 36 | 48 {
  return DISCOVER_PAGE_SIZES[scale];
}

export function selectDiscoverPageSize(
  viewport: UiScaleViewport,
  platform: UiScalePlatform = "web",
): 24 | 36 | 48 {
  return selectDiscoverPageSizeForScale(selectUiScale(viewport, platform).scale);
}

function readClientPageSize(): 24 | 36 | 48 {
  return selectDiscoverPageSize(
    { height: window.innerHeight, width: window.innerWidth },
    isWhisprDesktopRuntime() ? "desktop" : "web",
  );
}

function readServerPageSize(): 24 {
  return 24;
}

function subscribePageSize(listener: () => void): () => void {
  window.addEventListener("resize", listener, { passive: true });
  window.visualViewport?.addEventListener("resize", listener, { passive: true });

  return () => {
    window.removeEventListener("resize", listener);
    window.visualViewport?.removeEventListener("resize", listener);
  };
}

/** Global rem ölçeğini ikinci kez yazmadan aynı dört adımdan ilk sayfa yoğunluğunu okur. */
export function useDiscoverPageSize(): 24 | 36 | 48 {
  return useSyncExternalStore(subscribePageSize, readClientPageSize, readServerPageSize);
}
