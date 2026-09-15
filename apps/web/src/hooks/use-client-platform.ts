"use client";

import { useSyncExternalStore } from "react";
import { detectPlatform, type ClientPlatform } from "@wizards/ui/platform-keyboard.mjs";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

const subscribe = () => () => undefined;
const serverSnapshot = (): ClientPlatform => "unknown";

export function readClientPlatform(): ClientPlatform {
  if (typeof window === "undefined") return "unknown";
  const browser = window.navigator as Navigator & { userAgentData?: { platform?: string } };
  return detectPlatform({
    nativePlatform: isWhisprDesktopRuntime() ? (window.__WHISPR_DESKTOP__?.os ?? null) : null,
    userAgentDataPlatform: browser.userAgentData?.platform ?? null,
    platform: browser.platform,
    userAgent: browser.userAgent,
    maxTouchPoints: browser.maxTouchPoints,
  });
}

/** Native metadata is injected before React; browser OS is stable for the document. */
export function useClientPlatform(): ClientPlatform {
  return useSyncExternalStore(subscribe, readClientPlatform, serverSnapshot);
}
