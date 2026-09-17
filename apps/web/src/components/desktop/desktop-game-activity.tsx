"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GameIdSchema, type GameId } from "@wizards/types";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { getDesktopDetectedGame } from "@/lib/desktop/controls";
import { fetchGameSharingSettings, GAME_SHARING_QUERY_KEY } from "@/lib/game-activity/client";

export function DesktopGameActivity({ userId }: { userId: string }) {
  const desktop = isWhisprDesktopRuntime();
  const settings = useQuery({
    queryKey: GAME_SHARING_QUERY_KEY,
    queryFn: fetchGameSharingSettings,
    enabled: desktop,
    refetchInterval: desktop ? 60_000 : false,
  });
  useEffect(() => {
    if (!desktop || !userId || !settings.data?.enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failureReported = false;
    let publishedGame: GameId | null = null;
    const sessionId = crypto.randomUUID();
    const publish = async (gameId: GameId | null, label?: string | null) => {
      const response = await fetch("/api/v1/users/me/game-activity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          sessionId,
          ...(gameId?.startsWith("custom:") ? { label } : {}),
        }),
        keepalive: gameId === null,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Game activity update failed");
    };
    const poll = async () => {
      try {
        const detected = await getDesktopDetectedGame();
        if (!active) return;
        const gameId =
          detected.enabled && detected.gameId !== null ? GameIdSchema.parse(detected.gameId) : null;
        if (gameId === null && publishedGame === null) return;
        await publish(gameId, detected.label);
        publishedGame = gameId;
        // Cleanup may have run while the first heartbeat was still in flight.
        if (!active && gameId !== null) await publish(null);
        failureReported = false;
      } catch (error) {
        if (!failureReported) console.warn("[game-activity] Refresh failed", error);
        failureReported = true;
        // Native/connection failures must expire activity, never keep refreshing a stale game.
        // A later polling cycle can recover; the server record has a bounded lifetime.
      } finally {
        if (active)
          timer = setTimeout(() => {
            void poll();
          }, 20_000);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
      if (publishedGame !== null)
        void publish(null).catch(() => {
          /* Live presence and TTL hide disconnected clients. */
        });
    };
  }, [desktop, userId, settings.data?.enabled]);
  return null;
}
