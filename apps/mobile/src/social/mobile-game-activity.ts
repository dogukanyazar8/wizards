import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GAME_CATALOG, GameActivityResponseSchema } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";

export async function fetchMobileGameActivity(client: MobileApiClient, userId: string) {
  return GameActivityResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/users/${encodeURIComponent(userId)}/game-activity`),
  );
}

export function useMobileGameActivity(client: MobileApiClient, userId: string, enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  // This root is deliberately absent from the persisted-query allowlist.
  const query = useQuery({
    queryKey: ["mobile", "game-activity", userId],
    queryFn: () => fetchMobileGameActivity(client, userId),
    enabled,
    refetchInterval: enabled ? 20_000 : false,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const activity = query.data?.activity;
  useEffect(() => {
    if (!activity) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Date.parse(activity.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [activity]);
  if (!enabled || query.isError || !activity || Date.parse(activity.expiresAt) <= now) return null;
  return GAME_CATALOG.find((game) => game.id === activity.gameId)?.name ?? null;
}
