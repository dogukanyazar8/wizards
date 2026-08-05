import { BadgeIdSchema } from "@wizards/types";

import type { MobileNavigationRouteIntent } from "../../navigation/mobile-navigation-types";

/**
 * "Rozetlerim" is a section of `SettingsDetail`, not a screen of its own
 * (07 §2), so its address is this one string. It lives in a module with no
 * React imports because the notification router and the deep-link contract
 * test both need it and neither should pull a screen in to get it.
 */
export const MOBILE_BADGES_SETTINGS_SECTION = "badges";

/** `whispr://settings/badges`, optionally naming one badge. */
export const MOBILE_BADGES_ROUTE_PATH = `/settings/${MOBILE_BADGES_SETTINGS_SECTION}`;

export function buildMobileBadgesRouteIntent(badgeId?: string | null): MobileNavigationRouteIntent {
  // An unknown id is dropped rather than carried: a stale or forged value must
  // open the list, not a detail for a badge that does not exist.
  const parsed = BadgeIdSchema.safeParse(badgeId);

  return {
    name: "SettingsDetail",
    params: {
      ...(parsed.success ? { badgeId: parsed.data } : {}),
      section: MOBILE_BADGES_SETTINGS_SECTION,
    },
    type: "route",
  };
}
