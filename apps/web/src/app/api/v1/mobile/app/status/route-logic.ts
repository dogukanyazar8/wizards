import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getMobileServiceStatus } from "@/lib/app/service-status";
import { requireMobileApiUserId } from "@/lib/auth/api";

export type MobileServiceStatusRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:app:status"): Promise<void>;
  getStatus: typeof getMobileServiceStatus;
};

const defaultDependencies: MobileServiceStatusRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  getStatus: getMobileServiceStatus,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function mobileServiceStatusRoute(
  request: Request,
  dependencies: MobileServiceStatusRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:app:status");
    const payload = await dependencies.getStatus();

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
