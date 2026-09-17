"use client";
import { useQuery } from "@tanstack/react-query";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

/** Reuses server rollout/targeting; no independent client override can enable 4K. */
export function useScreenShare4kFlag() {
  return (
    useQuery({
      queryKey: ["feature-flags"],
      staleTime: 60_000,
      queryFn: async () => {
        const response = await fetch("/api/v1/feature-flags", {
          headers: { "X-Whispr-Client": isWhisprDesktopRuntime() ? "desktop" : "web" },
        });
        if (!response.ok) throw new Error("FEATURE_FLAGS_UNAVAILABLE");
        const flags: unknown = await response.json();
        return (
          typeof flags === "object" &&
          flags !== null &&
          "screenShare4k" in flags &&
          flags.screenShare4k === true
        );
      },
    }).data === true
  );
}
