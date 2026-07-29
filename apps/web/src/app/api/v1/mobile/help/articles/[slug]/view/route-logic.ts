import {
  MobileHelpArticleSlugParamsSchema,
  MobileHelpArticleViewResponseSchema,
} from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { recordMobileHelpArticleView } from "@/lib/help/help-service";

/**
 * The slug is the whole request, so there is no body — the matching entry in
 * `route-contract.test.ts`'s bodyless allowlist is what documents that.
 */

export type MobileHelpArticleViewRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileHelpArticleViewRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:help:view"): Promise<void>;
  recordView: typeof recordMobileHelpArticleView;
};

const defaultDependencies: MobileHelpArticleViewRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  recordView: recordMobileHelpArticleView,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileHelpArticleViewRoute(
  request: Request,
  context: MobileHelpArticleViewRouteContext,
  dependencies: MobileHelpArticleViewRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:help:view");
    const { slug } = MobileHelpArticleSlugParamsSchema.parse(await context.params);
    const payload = await dependencies.recordView(slug);

    return Response.json(MobileHelpArticleViewResponseSchema.parse(payload), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return jsonError(error);
  }
}
