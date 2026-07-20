import {
  MobileLocaleUpdateRequestSchema,
  MobileLocaleUpdateResponseSchema,
  type MobileLocaleUpdateRequest,
} from "@wizards/types";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { persistUserLocale } from "@/lib/locale/persistence";

export type MobileLocaleRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  parseBody(request: Request): Promise<MobileLocaleUpdateRequest>;
  persistLocale(userId: string, locale: string): Promise<string>;
};

const defaultDependencies: MobileLocaleRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request) => parseJsonBody(request, MobileLocaleUpdateRequestSchema),
  persistLocale: persistUserLocale,
};

/**
 * Mirrors the mobile language choice onto the account so the web client opens in
 * the same language. The device keeps its own copy; this endpoint is best-effort
 * from the app's point of view and never gates the local preference.
 */
export async function mobileAccountLocaleUpdateRoute(
  request: Request,
  dependencies: MobileLocaleRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:account:locale");
    const { locale } = await dependencies.parseBody(request);
    const persisted = await dependencies.persistLocale(userId, locale);

    return Response.json(MobileLocaleUpdateResponseSchema.parse({ locale: persisted }));
  } catch (error) {
    return jsonError(error);
  }
}
