import { MobileAuthRefreshRequestSchema, type MobileAuthRefreshRequest } from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { refreshMobileSession } from "@/lib/mobile/auth";
import {
  createMobileAuthCredentialSubject,
  enforceMobileAuthRateLimit,
  type MobileAuthRateLimitSubject,
} from "../rate-limit";

export type MobileAuthRefreshRouteDependencies = {
  enforceRateLimit(request: Request, subject: MobileAuthRateLimitSubject): Promise<void>;
  parseRequest(request: Request): Promise<MobileAuthRefreshRequest>;
  refreshSession: typeof refreshMobileSession;
};

const defaultDependencies: MobileAuthRefreshRouteDependencies = {
  enforceRateLimit: (request, subject) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-refresh", subject),
  parseRequest: (request) => parseJsonBody(request, MobileAuthRefreshRequestSchema),
  refreshSession: refreshMobileSession,
};

export async function mobileAuthRefreshRoute(
  request: Request,
  dependencies: MobileAuthRefreshRouteDependencies = defaultDependencies,
) {
  try {
    const body = await dependencies.parseRequest(request);
    await dependencies.enforceRateLimit(
      request,
      createMobileAuthCredentialSubject("refresh-token", body.refreshToken),
    );
    const response = await dependencies.refreshSession(body.refreshToken);

    if (!response) {
      throw new ApiError("Mobile session refresh is invalid or expired.", 401, "INVALID_REFRESH");
    }

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
