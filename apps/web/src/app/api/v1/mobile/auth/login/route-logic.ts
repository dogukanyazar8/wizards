import {
  MobileAuthPasswordLoginRequestSchema,
  type MobileAuthPasswordLoginRequest,
} from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { createMobilePasswordSession, MobileNativeAuthError } from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit } from "../rate-limit";

export type MobilePasswordLoginRouteDependencies = {
  createPasswordSession: (
    input: MobileAuthPasswordLoginRequest,
  ) => ReturnType<typeof createMobilePasswordSession>;
  enforceIpRateLimit: (request: Request) => Promise<void>;
  parseLoginRequest: (request: Request) => Promise<MobileAuthPasswordLoginRequest>;
};

const defaultMobilePasswordLoginRouteDependencies: MobilePasswordLoginRouteDependencies = {
  createPasswordSession: ({ email, password, twoFactorCode }) =>
    createMobilePasswordSession(
      twoFactorCode === undefined ? { email, password } : { email, password, twoFactorCode },
    ),
  enforceIpRateLimit: (request) => enforceMobileAuthRateLimit(request, "mobile:auth-login"),
  parseLoginRequest: (request) => parseJsonBody(request, MobileAuthPasswordLoginRequestSchema),
};

export async function mobilePasswordLoginRoute(
  request: Request,
  dependencies: MobilePasswordLoginRouteDependencies = defaultMobilePasswordLoginRouteDependencies,
) {
  try {
    await dependencies.enforceIpRateLimit(request);
    const body = await dependencies.parseLoginRequest(request);
    const response = await dependencies.createPasswordSession(body);

    if (!response) {
      throw new ApiError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
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
