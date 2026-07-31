import {
  MobileAuthForgotPasswordRequestSchema,
  type MobileAuthForgotPasswordRequest,
} from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { MobileNativeAuthError, requestMobilePasswordReset } from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit, type MobileAuthRateLimitSubject } from "../rate-limit";

export type MobileForgotPasswordRouteDependencies = {
  enforceRateLimit(request: Request, subject: MobileAuthRateLimitSubject): Promise<void>;
  parseRequest(request: Request): Promise<MobileAuthForgotPasswordRequest>;
  requestPasswordReset: typeof requestMobilePasswordReset;
};

const defaultDependencies: MobileForgotPasswordRouteDependencies = {
  enforceRateLimit: (request, subject) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-forgot-password", subject),
  parseRequest: (request) => parseJsonBody(request, MobileAuthForgotPasswordRequestSchema),
  requestPasswordReset: requestMobilePasswordReset,
};

export async function mobileForgotPasswordRoute(
  request: Request,
  dependencies: MobileForgotPasswordRouteDependencies = defaultDependencies,
) {
  try {
    const body = await dependencies.parseRequest(request);
    await dependencies.enforceRateLimit(request, {
      namespace: "email",
      value: body.email.trim().toLowerCase(),
    });
    const response = await dependencies.requestPasswordReset(body);

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof MobileNativeAuthError) {
      return jsonError(new ApiError(error.message, error.status, error.code));
    }

    return jsonError(error);
  }
}
