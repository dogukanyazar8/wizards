import {
  MobileAuthGoogleLoginRequestSchema,
  type MobileAuthGoogleLoginRequest,
} from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { createMobileGoogleSession, MobileNativeAuthError } from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit } from "../rate-limit";

export type MobileGoogleLoginRouteDependencies = {
  createGoogleSession: (
    input: MobileAuthGoogleLoginRequest,
  ) => ReturnType<typeof createMobileGoogleSession>;
  enforceIpRateLimit: (request: Request) => Promise<void>;
  parseGoogleLoginRequest: (request: Request) => Promise<MobileAuthGoogleLoginRequest>;
};

const defaultMobileGoogleLoginRouteDependencies: MobileGoogleLoginRouteDependencies = {
  createGoogleSession: ({ idToken, locale }) =>
    createMobileGoogleSession(locale === undefined ? { idToken } : { idToken, locale }),
  enforceIpRateLimit: (request) => enforceMobileAuthRateLimit(request, "mobile:auth-google"),
  parseGoogleLoginRequest: (request) => parseJsonBody(request, MobileAuthGoogleLoginRequestSchema),
};

export async function mobileGoogleLoginRoute(
  request: Request,
  dependencies: MobileGoogleLoginRouteDependencies = defaultMobileGoogleLoginRouteDependencies,
) {
  try {
    await dependencies.enforceIpRateLimit(request);
    const body = await dependencies.parseGoogleLoginRequest(request);
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
