import { MobileAppUpdateQuerySchema, MobileAppUpdateResponseSchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { decideMobileUpdate } from "@/lib/app/mobile-update-decision-service";
import { tryReleasePublisherUserId } from "@/lib/releases/release-publisher-auth";

/**
 * 1a's status row and 1d's update card.
 *
 * The server does not pretend to run an update: it reports the newest published
 * release on the requested channel and whether the caller is behind it. The
 * `checking` / `downloading` / `ready` / `failed` states in the shared union are
 * client-side transitions.
 */

export type MobileAppUpdateRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  decideUpdate: typeof decideMobileUpdate;
  enforceRateLimit(userId: string, action: "mobile:app:update"): Promise<void>;
  now(): Date;
};

const defaultDependencies: MobileAppUpdateRouteDependencies = {
  authenticate: async (request) =>
    tryReleasePublisherUserId(request) ?? requireMobileApiUserId(request),
  decideUpdate: decideMobileUpdate,
  enforceRateLimit: enforceApiRateLimit,
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
    const decision = await dependencies.decideUpdate(query);

    return Response.json(
      MobileAppUpdateResponseSchema.parse({
        ...decision,
        lastCheckedAt: dependencies.now().toISOString(),
      }),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return jsonError(error);
  }
}
