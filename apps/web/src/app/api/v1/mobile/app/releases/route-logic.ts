import { MobileReleaseListQuerySchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { listMobileReleases } from "@/lib/releases/release-service";

export type MobileReleaseListRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:app:releases"): Promise<void>;
  listReleases: typeof listMobileReleases;
};

const defaultDependencies: MobileReleaseListRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  listReleases: listMobileReleases,
};

/** A version can be published between two pages; nothing here may be cached. */
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileReleaseListRoute(
  request: Request,
  dependencies: MobileReleaseListRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:app:releases");
    const query = MobileReleaseListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const payload = await dependencies.listReleases({
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.installed === undefined ? {} : { installedVersion: query.installed }),
      limit: query.limit,
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
