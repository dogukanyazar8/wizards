import {
  MobileAuthVerificationEmailRequestSchema,
  type MobileAuthVerificationEmailRequest,
} from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { MobileNativeAuthError, requestMobileVerificationEmail } from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit, type MobileAuthRateLimitSubject } from "../rate-limit";

export type MobileVerificationEmailRouteDependencies = {
  enforceRateLimit(request: Request, subject: MobileAuthRateLimitSubject): Promise<void>;
  parseRequest(request: Request): Promise<MobileAuthVerificationEmailRequest>;
  requestVerificationEmail: typeof requestMobileVerificationEmail;
};

const defaultDependencies: MobileVerificationEmailRouteDependencies = {
  enforceRateLimit: (request, subject) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-verification-email", subject),
  parseRequest: (request) => parseJsonBody(request, MobileAuthVerificationEmailRequestSchema),
  requestVerificationEmail: requestMobileVerificationEmail,
};

export async function mobileVerificationEmailRoute(
  request: Request,
  dependencies: MobileVerificationEmailRouteDependencies = defaultDependencies,
) {
  try {
    const body = await dependencies.parseRequest(request);
    await dependencies.enforceRateLimit(request, {
      namespace: "email",
      value: body.email.trim().toLowerCase(),
    });
    const response = await dependencies.requestVerificationEmail(body);

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
