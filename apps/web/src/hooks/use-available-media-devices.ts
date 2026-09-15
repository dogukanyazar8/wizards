"use client";

import { useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

export const MEDIA_DEVICES_QUERY_KEY = ["device", "media-inputs-outputs"] as const;

/** Shared by audio/camera pickers. Enumerating never requests capture permission. */
export function useAvailableMediaDevices() {
  const supported =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.enumerateDevices);
  const query = useQuery({
    queryKey: MEDIA_DEVICES_QUERY_KEY,
    queryFn: async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.map(({ deviceId, groupId, kind, label }) => ({
        deviceId,
        groupId,
        kind,
        label,
      }));
    },
    enabled: supported,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const refetch = query.refetch;
  const refresh = useCallback(async () => {
    if (supported) await refetch();
  }, [supported, refetch]);
  useEffect(() => {
    if (!supported) return;
    const media = navigator.mediaDevices;
    const refreshOnChange = () => {
      void refresh();
    };
    media.addEventListener("devicechange", refreshOnChange);
    return () => media.removeEventListener("devicechange", refreshOnChange);
  }, [supported, refresh]);
  return { query, supported, refresh };
}
