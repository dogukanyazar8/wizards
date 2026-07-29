import { MobileReleaseVersionParamsSchema } from "@wizards/types";

import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { getMobileRelease } from "@/lib/releases/release-service";

export type MobileReleaseDetailRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileReleaseDetailRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:app:release-detail"): Promise<void>;
  getRelease: typeof getMobileRelease;
};

const defaultDependencies: MobileReleaseDetailRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  getRelease: getMobileRelease,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileReleaseDetailRoute(
  request: Request,
  context: MobileReleaseDetailRouteContext,
  dependencies: MobileReleaseDetailRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:app:release-detail");
    const { version } = MobileReleaseVersionParamsSchema.parse(await context.params);
    const installed = new URL(request.url).searchParams.get("installed") ?? undefined;
    const payload = await dependencies.getRelease(version, installed);

    // A draft and a typo are the same thing from here: the service only ever
    // returns published releases, so "not found" covers both without leaking
    // which unannounced versions exist.
    if (!payload) {
      throw new ApiError("Release not found", 404, "RELEASE_NOT_FOUND");
    }

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
