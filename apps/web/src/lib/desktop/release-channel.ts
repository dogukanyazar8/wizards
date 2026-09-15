import type { MobileReleaseChannel } from "@wizards/types";

/** Stable uses PROD; Beta uses UAT. Environment names are not extra release channels. */
export const DESKTOP_RELEASE_CHANNELS = ["stable", "beta"] as const;
export type DesktopReleaseChannel = (typeof DESKTOP_RELEASE_CHANNELS)[number];

export function toReleaseChannelColumnValue(channel: DesktopReleaseChannel): MobileReleaseChannel {
  return channel;
}

export function fromReleaseChannelColumnValue(
  value: string | null | undefined,
): DesktopReleaseChannel {
  const normalized = (value ?? "").toLowerCase();
  return normalized === "beta" || normalized === "uat" ? "beta" : "stable";
}
