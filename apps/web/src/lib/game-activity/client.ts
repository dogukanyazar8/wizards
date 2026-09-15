"use client";
import { GameSharingSettingsSchema, GameActivityResponseSchema } from "@wizards/types";

export const GAME_SHARING_QUERY_KEY = ["game-sharing-settings"] as const;
export async function fetchGameSharingSettings() {
  const response = await fetch("/api/v1/users/me/game-activity", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load game sharing settings");
  return GameSharingSettingsSchema.parse(await response.json());
}
export async function updateGameSharingSettingsRequest(enabled: boolean) {
  const response = await fetch("/api/v1/users/me/game-activity", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) throw new Error("Unable to save game sharing settings");
  return GameSharingSettingsSchema.parse(await response.json());
}
export async function fetchUserGameActivity(userId: string) {
  const response = await fetch(`/api/v1/users/${encodeURIComponent(userId)}/game-activity`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load game activity");
  return GameActivityResponseSchema.parse(await response.json());
}
