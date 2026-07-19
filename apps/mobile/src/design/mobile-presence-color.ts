import type { MobilePresenceTone } from "../app/mobile-display-model";
import type { MobileTheme } from "./themes";

/**
 * Canonical presence accent, mirroring the web status colours
 * (online = success, idle = warning, dnd = danger, offline = muted dot).
 * Used for avatar rings and presence dots so every surface agrees.
 */
export function getMobilePresenceColor(tone: MobilePresenceTone, theme: MobileTheme): string {
  switch (tone) {
    case "online":
      return theme.status.success;
    case "idle":
      return theme.status.warning;
    case "dnd":
      return theme.status.danger;
    default:
      return theme.control.separatorDot;
  }
}
