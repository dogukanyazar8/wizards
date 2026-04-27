"use client";

import type { UserLayoutSettings } from "@/app/api/v1/users/me/settings/route";

export const settingsQueryKeys = {
  layout: ["user", "layout-settings"] as const,
};

export async function fetchLayoutSettings(): Promise<UserLayoutSettings> {
  const res = await fetch("/api/v1/users/me/settings");
  if (!res.ok) throw new Error("Failed to fetch layout settings");
  return res.json();
}

export async function patchLayoutSettings(
  patch: Partial<UserLayoutSettings>,
): Promise<UserLayoutSettings> {
  const res = await fetch("/api/v1/users/me/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to save layout settings");
  return res.json();
}
