import { prisma } from "@wizards/db";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { broadcastPresenceVisibilityChanged } from "@/lib/friends/service";
import { logError } from "@/lib/logger";
import {
  mobileAccountPreferencesGetRoute,
  mobileAccountPreferencesPatchRoute,
  type AccountPreferencesPersistence,
  type AccountPreferencesPersistencePatch,
  type MobileAccountPreferencesDependencies,
} from "./route-logic";

const preferenceSelect = {
  dateFormat: true,
  interfaceDensity: true,
  presenceVisibility: true,
  profileVisibility: true,
  timeFormat: true,
  timeZone: true,
} as const;

const dependencies: MobileAccountPreferencesDependencies = {
  authenticate: requireMobileApiUserId,
  enforceRateLimit: (userId) => enforceApiRateLimit(userId, "mobile:account:settings"),
  loadPreferences: (userId): Promise<AccountPreferencesPersistence | null> =>
    prisma.userSettings.findUnique({ where: { userId }, select: preferenceSelect }),
  onPresenceVisibilityChanged: async (userId) => {
    try {
      await broadcastPresenceVisibilityChanged(userId);
    } catch (error) {
      logError("[mobile settings] Presence visibility rebroadcast failed", error);
    }
  },
  updatePreferences: (
    userId,
    patch: AccountPreferencesPersistencePatch,
  ): Promise<AccountPreferencesPersistence> =>
    prisma.userSettings.update({
      where: { userId },
      data: patch,
      select: preferenceSelect,
    }),
};

export function GET(request: Request) {
  return mobileAccountPreferencesGetRoute(request, dependencies);
}

export function PATCH(request: Request) {
  return mobileAccountPreferencesPatchRoute(request, dependencies);
}
