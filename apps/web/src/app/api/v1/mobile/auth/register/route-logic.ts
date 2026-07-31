import { MobileAuthRegisterRequestSchema, type MobileAuthRegisterRequest } from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { MobileNativeAuthError, registerMobilePasswordAccount } from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit, type MobileAuthRateLimitSubject } from "../rate-limit";

export type MobilePasswordRegisterRouteDependencies = {
  enforceRateLimit: (request: Request, subject: MobileAuthRateLimitSubject) => Promise<void>;
  parseRegisterRequest: (request: Request) => Promise<MobileAuthRegisterRequest>;
  registerPassword: (
    input: MobileAuthRegisterRequest,
  ) => ReturnType<typeof registerMobilePasswordAccount>;
};

const defaultMobilePasswordRegisterRouteDependencies: MobilePasswordRegisterRouteDependencies = {
  enforceRateLimit: (request, subject) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-register", subject),
  parseRegisterRequest: (request) => parseJsonBody(request, MobileAuthRegisterRequestSchema),
  registerPassword: registerMobilePasswordAccount,
};

export async function mobilePasswordRegisterRoute(
  request: Request,
  dependencies: MobilePasswordRegisterRouteDependencies = defaultMobilePasswordRegisterRouteDependencies,
) {
  try {
    const body = await dependencies.parseRegisterRequest(request);
    await dependencies.enforceRateLimit(request, {
      namespace: "email",
      value: body.email.trim().toLowerCase(),
    });
    const response = await dependencies.registerPassword(body);

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
