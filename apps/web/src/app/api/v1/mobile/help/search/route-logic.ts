import { MobileHelpSearchQuerySchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { searchMobileHelpArticles } from "@/lib/help/help-service";

export type MobileHelpSearchRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:help:search"): Promise<void>;
  searchArticles: typeof searchMobileHelpArticles;
};

const defaultDependencies: MobileHelpSearchRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  searchArticles: searchMobileHelpArticles,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileHelpSearchRoute(
  request: Request,
  dependencies: MobileHelpSearchRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:help:search");
    // A one-character query matches most of the table; the schema's minimum
    // turns it into a 400 rather than a full scan the client throws away.
    const { q } = MobileHelpSearchQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const payload = await dependencies.searchArticles(q);

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
