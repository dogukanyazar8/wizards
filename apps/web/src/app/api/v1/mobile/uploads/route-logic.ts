import { MobileMediaClaimRequestSchema, MobileMediaClaimResponseSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { claimMobileMediaUpload } from "@/lib/mobile/mobile-media-upload-service";

type MobileMediaClaimRateLimitAction = "mobile:media:claim";

export type MobileMediaClaimRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  claimUpload: typeof claimMobileMediaUpload;
  enforceRateLimit(userId: string, action: MobileMediaClaimRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: MobileMediaClaimRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  claimUpload: claimMobileMediaUpload,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

export async function mobileMediaClaimRoute(
  request: Request,
  dependencies: MobileMediaClaimRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:media:claim");
    const input = await dependencies.parseBody(request, MobileMediaClaimRequestSchema);
    const claimed = await dependencies.claimUpload(userId, input);

    return Response.json(MobileMediaClaimResponseSchema.parse(claimed));
  } catch (error) {
    return jsonError(error);
  }
}
