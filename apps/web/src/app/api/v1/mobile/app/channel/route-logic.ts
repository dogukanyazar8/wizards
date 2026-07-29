import { MobileAppChannelRequestSchema, MobileAppChannelResponseSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { setMobilePreferredReleaseChannel } from "@/lib/app/release-channel-service";

/**
 * 2c "Güncelleme kanalı".
 *
 * This records a preference and nothing else. The EAS channel the installed
 * binary shipped on is fixed at build time, so the honest answer is
 * `effectiveFrom: "next-build"` — which is exactly what the screen tells the
 * user instead of implying an immediate switch.
 */

export type MobileAppChannelRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:app:channel"): Promise<void>;
  parseBody: typeof parseJsonBody;
  setChannel: typeof setMobilePreferredReleaseChannel;
};

const defaultDependencies: MobileAppChannelRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  setChannel: setMobilePreferredReleaseChannel,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileAppChannelRoute(
  request: Request,
  dependencies: MobileAppChannelRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:app:channel");
    const input = await dependencies.parseBody(request, MobileAppChannelRequestSchema);
    await dependencies.setChannel(userId, input.channel);

    return Response.json(
      MobileAppChannelResponseSchema.parse({
        channel: input.channel,
        effectiveFrom: "next-build",
        requiresRestart: true,
      }),
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return jsonError(error);
  }
}
