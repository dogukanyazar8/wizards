import { queryOptions } from "@tanstack/react-query";
import { WHISPR_BUILD_ID, type WhisprVersionPayload } from "@/lib/app-version";
import { nativeSettingsClient } from "@/lib/desktop/settings-client";

export const APP_UPDATE_INSTALL_KEY = ["app-update", "install"] as const;
export const APP_UPDATE_INTERVAL = { desktop: 30 * 60_000, web: 60_000 };

export function hasActiveUpdateCall(state: {
  activeChannelId: string | null;
  activeConversationId: string | null;
}) {
  return state.activeChannelId !== null || state.activeConversationId !== null;
}

export function appUpdateQueryOptions(desktop: boolean) {
  return queryOptions({
    queryKey: ["app-update", desktop ? "desktop" : "web"],
    queryFn: async (context) => {
      if (desktop) {
        const result = await nativeSettingsClient.check();
        return { ...result, webVersion: null, checkedAt: Date.now() };
      }
      const response = await fetch("/api/v1/app/version", {
        signal: context.signal,
        cache: "no-store",
        headers: { "x-whispr-client-build": WHISPR_BUILD_ID },
      });
      if (!response.ok) throw new Error("Unable to check Whispr version.");
      const result: WhisprVersionPayload = await response.json();
      if (!result.buildId || !result.version || !Array.isArray(result.notes)) {
        throw new Error("Invalid Whispr version response.");
      }
      return {
        enabled: true,
        available: result.buildId !== WHISPR_BUILD_ID,
        currentVersion: null,
        latestVersion: result.version,
        webVersion: result,
        checkedAt: Date.now(),
      };
    },
    staleTime: desktop ? APP_UPDATE_INTERVAL.desktop : APP_UPDATE_INTERVAL.web,
    gcTime: typeof window === "undefined" ? Infinity : 60 * 60_000,
    retry: false,
  });
}
