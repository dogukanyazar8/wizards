import { MobileAppUpdateQuerySchema, MobileAppUpdateResponseSchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { compareReleaseVersions, getMobileLatestRelease } from "@/lib/releases/release-service";

/**
 * 1a's status row and 1d's update card.
 *
 * The server does not pretend to run an update: it reports the newest published
 * release on the requested channel and whether the caller is behind it. The
 * `checking` / `downloading` / `ready` / `failed` states in the shared union are
 * client-side transitions.
 */

/**
 * `app.config.js` carries no `updates` key, so `Updates.isEnabled` is false on
 * every build. Saying so is the point: 1d must not offer a download this
 * deployment cannot deliver. Flip this when OTA is actually configured.
 */
export const MOBILE_OTA_ENABLED = false;

export type MobileAppUpdateRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:app:update"): Promise<void>;
  getLatestRelease: typeof getMobileLatestRelease;
  now(): Date;
};

const defaultDependencies: MobileAppUpdateRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  getLatestRelease: getMobileLatestRelease,
  now: () => new Date(),
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileAppUpdateRoute(
  request: Request,
  dependencies: MobileAppUpdateRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:app:update");
    const query = MobileAppUpdateQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const latest = await dependencies.getLatestRelease(query.channel ?? "stable");

    // No published release, or the caller is running something newer than the
    // newest one we know about (an internal build), both mean "nothing to do".
    const isBehind =
      latest !== null &&
      query.installed !== undefined &&
      compareReleaseVersions(query.installed, latest.version) < 0;

    return Response.json(
      MobileAppUpdateResponseSchema.parse({
        lastCheckedAt: dependencies.now().toISOString(),
        otaEnabled: MOBILE_OTA_ENABLED,
        state: isBehind ? "available" : "current",
        ...(isBehind && latest ? { latest } : {}),
      }),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return jsonError(error);
  }
}
