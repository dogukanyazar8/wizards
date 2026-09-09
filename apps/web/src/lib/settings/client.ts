"use client";

import {
  MentionSettingsSchema,
  type MentionSettings,
  type MentionSettingsPatch,
} from "@wizards/types";

import type { UserSettingsResponse } from "@/app/api/v1/users/me/settings/route";
import type { HomePresenceStatus } from "@/lib/home/presentation";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";

export const settingsQueryKeys = {
  bootstrap: ["user", "settings-bootstrap"] as const,
  layout: ["user", "layout-settings"] as const,
  /** Bahsedilmeler Ş4 §7. Shared by the Settings page and the mention modal — one key, one cache. */
  mentions: ["user", "mention-settings"] as const,
};

/** Ayarlar penceresi bir oturum boyunca birden çok kez açılır; bootstrap her açılışta tazelenmez. */
export const SETTINGS_BOOTSTRAP_STALE_TIME_MS = 60_000;

export async function fetchSettingsBootstrap(): Promise<SettingsBootstrapPayload> {
  const res = await fetch("/api/v1/users/me/settings/bootstrap");
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

/**
 * Ayarlar penceresinin sol navigasyon ayağının çizdiği kimlik — Ş5 §3.
 *
 * `UserStatus` beş değer taşır (`INVISIBLE` dahil); presence noktası dördü çizer. `INVISIBLE`
 * kullanıcının **kendi** penceresinde `OFFLINE` görünür: görünmez olmayı seçen kişiye de
 * çevrimdışı görünür, çünkü karşı taraf onu öyle görüyor.
 */
export type SettingsWindowIdentity = {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly status: HomePresenceStatus;
  readonly username: string;
};

export function toSettingsWindowIdentity(
  account: SettingsBootstrapPayload["initialAccount"],
): SettingsWindowIdentity {
  return {
    avatarUrl: account.avatarUrl,
    displayName: account.displayName ?? account.username,
    status:
      account.status === "IDLE" || account.status === "DND" || account.status === "OFFLINE"
        ? account.status
        : account.status === "INVISIBLE"
          ? "OFFLINE"
          : "ONLINE",
    username: account.username,
  };
}

export async function fetchLayoutSettings(): Promise<UserSettingsResponse> {
  const res = await fetch("/api/v1/users/me/settings");
  if (!res.ok) throw new Error("Failed to fetch layout settings");
  return res.json();
}

export async function patchLayoutSettings(
  patch: Partial<UserSettingsResponse>,
): Promise<UserSettingsResponse> {
  const res = await fetch("/api/v1/users/me/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to save layout settings");
  return res.json();
}

const MENTION_SETTINGS_ENDPOINT = "/api/v1/notifications/mention-settings";

export async function fetchMentionSettings(): Promise<MentionSettings> {
  const res = await fetch(MENTION_SETTINGS_ENDPOINT);
  if (!res.ok) throw new Error("Failed to fetch mention settings");
  return MentionSettingsSchema.parse(await res.json());
}

export async function patchMentionSettings(patch: MentionSettingsPatch): Promise<MentionSettings> {
  const res = await fetch(MENTION_SETTINGS_ENDPOINT, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to save mention settings");
  return MentionSettingsSchema.parse(await res.json());
}
