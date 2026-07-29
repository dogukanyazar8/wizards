import { MobileHelpArticleListQuerySchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { listMobileHelpArticles } from "@/lib/help/help-service";

export type MobileHelpArticleListRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:help:list"): Promise<void>;
  listArticles: typeof listMobileHelpArticles;
};

const defaultDependencies: MobileHelpArticleListRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  listArticles: listMobileHelpArticles,
};

/** View counts move the popular ordering, so a cached list goes stale fast. */
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileHelpArticleListRoute(
  request: Request,
  dependencies: MobileHelpArticleListRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:help:list");
    const query = MobileHelpArticleListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const payload = await dependencies.listArticles({
      ...(query.category === undefined ? {} : { category: query.category }),
      popular: query.popular === "1",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
