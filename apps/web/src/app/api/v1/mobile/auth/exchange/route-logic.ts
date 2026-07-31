import { MobileAuthExchangeRequestSchema, type MobileAuthExchangeRequest } from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { exchangeMobileAuthHandoffToken } from "@/lib/mobile/auth";
import {
  createMobileAuthCredentialSubject,
  enforceMobileAuthRateLimit,
  type MobileAuthRateLimitSubject,
} from "../rate-limit";

export type MobileAuthExchangeRouteDependencies = {
  enforceRateLimit(request: Request, subject: MobileAuthRateLimitSubject): Promise<void>;
  exchangeToken: typeof exchangeMobileAuthHandoffToken;
  parseRequest(request: Request): Promise<MobileAuthExchangeRequest>;
};

const defaultDependencies: MobileAuthExchangeRouteDependencies = {
  enforceRateLimit: (request, subject) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-exchange", subject),
  exchangeToken: exchangeMobileAuthHandoffToken,
  parseRequest: (request) => parseJsonBody(request, MobileAuthExchangeRequestSchema),
};

export async function mobileAuthExchangeRoute(
  request: Request,
  dependencies: MobileAuthExchangeRouteDependencies = defaultDependencies,
) {
  try {
    const body = await dependencies.parseRequest(request);
    await dependencies.enforceRateLimit(
      request,
      createMobileAuthCredentialSubject("handoff-token", body.handoffToken),
    );
    const response = await dependencies.exchangeToken(body.handoffToken, {
      expectedCallbackPath: body.callbackPath,
    });

    if (!response) {
      throw new ApiError("Mobile sign-in handoff is invalid or expired.", 401, "INVALID_HANDOFF");
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
