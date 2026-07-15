import {
  MobileAuthRegisterRequestSchema,
  type MobileAuthRegisterRequest,
} from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { verifyTurnstileToken } from "@/lib/auth/turnstile";
import {
  MobileNativeAuthError,
  registerMobilePasswordAccount,
} from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit, getMobileAuthRequestIp } from "../rate-limit";

export type MobilePasswordRegisterRouteDependencies = {
  enforceIpRateLimit: (request: Request) => Promise<void>;
  parseRegisterRequest: (request: Request) => Promise<MobileAuthRegisterRequest>;
  registerPassword: (
    input: MobileAuthRegisterRequest,
  ) => ReturnType<typeof registerMobilePasswordAccount>;
  verifyTurnstile: (request: Request, token: string) => Promise<void>;
};

export async function verifyMobilePasswordRegisterTurnstile(request: Request, token: string) {
  await verifyTurnstileToken(token, getMobileAuthRequestIp(request), {
    expectedAction: "register",
  });
}

const defaultMobilePasswordRegisterRouteDependencies: MobilePasswordRegisterRouteDependencies = {
  enforceIpRateLimit: (request) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-register"),
  parseRegisterRequest: (request) =>
    parseJsonBody(request, MobileAuthRegisterRequestSchema),
  registerPassword: registerMobilePasswordAccount,
  verifyTurnstile: verifyMobilePasswordRegisterTurnstile,
};

export async function mobilePasswordRegisterRoute(
  request: Request,
  dependencies: MobilePasswordRegisterRouteDependencies =
    defaultMobilePasswordRegisterRouteDependencies,
) {
  try {
    await dependencies.enforceIpRateLimit(request);
    const body = await dependencies.parseRegisterRequest(request);
    try {
      await dependencies.verifyTurnstile(request, body.turnstileToken);
    } catch {
      throw new ApiError("Human verification failed.", 400, "TURNSTILE_FAILED");
    }
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
