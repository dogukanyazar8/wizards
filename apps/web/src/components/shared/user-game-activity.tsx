"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gamepad2 } from "lucide-react";
import { GAME_CATALOG } from "@wizards/types";
import { fetchUserGameActivity } from "@/lib/game-activity/client";
import { useI18n } from "@/components/providers/locale-provider";

export function UserGameActivity({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now);
  const query = useQuery({
    queryKey: ["user-game-activity", userId],
    queryFn: () => fetchUserGameActivity(userId),
    refetchInterval: 20_000,
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
  if (query.isError || !activity || Date.parse(activity.expiresAt) <= now) return null;
  const game = GAME_CATALOG.find((entry) => entry.id === activity.gameId);
  const label = game?.name ?? (activity.gameId.startsWith("custom:") ? activity.label : null);
  if (!label) return null;
  return (
    <p
      className="mt-2 flex items-center gap-2 text-xs text-app-muted"
      data-testid="user-game-activity"
    >
      <Gamepad2 size={14} aria-hidden="true" />
      {t("profile.playingGame", { game: label })}
    </p>
  );
}
