import {
  MobileAuthGoogleLoginRequestSchema,
  type MobileAuthGoogleLoginRequest,
} from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { createMobileGoogleSession, MobileNativeAuthError } from "@/lib/mobile/auth";
import {
  createMobileAuthCredentialSubject,
  enforceMobileAuthRateLimit,
  type MobileAuthRateLimitSubject,
} from "../rate-limit";

export type MobileGoogleLoginRouteDependencies = {
  createGoogleSession: (
    input: MobileAuthGoogleLoginRequest,
  ) => ReturnType<typeof createMobileGoogleSession>;
  enforceRateLimit: (request: Request, subject: MobileAuthRateLimitSubject) => Promise<void>;
  parseGoogleLoginRequest: (request: Request) => Promise<MobileAuthGoogleLoginRequest>;
};

const defaultMobileGoogleLoginRouteDependencies: MobileGoogleLoginRouteDependencies = {
  createGoogleSession: (input) => createMobileGoogleSession(input),
  enforceRateLimit: (request, subject) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-google", subject),
  parseGoogleLoginRequest: (request) => parseJsonBody(request, MobileAuthGoogleLoginRequestSchema),
};

export async function mobileGoogleLoginRoute(
  request: Request,
  dependencies: MobileGoogleLoginRouteDependencies = defaultMobileGoogleLoginRouteDependencies,
) {
  try {
    const body = await dependencies.parseGoogleLoginRequest(request);
    await dependencies.enforceRateLimit(
      request,
      createMobileAuthCredentialSubject("google-credential", body.idToken),
    );
    const response = await dependencies.createGoogleSession(body);

    if (!response) {
      throw new ApiError("Google sign-in failed.", 401, "GOOGLE_TOKEN_INVALID");
    }

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
