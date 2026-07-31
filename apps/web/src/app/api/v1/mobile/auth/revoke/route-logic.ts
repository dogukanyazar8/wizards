import { MobileAuthRevokeRequestSchema, type MobileAuthRevokeRequest } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import {
  getBearerTokenFromRequest,
  revokeMobileSession,
  verifyMobileAccessToken,
} from "@/lib/mobile/auth";
import {
  createMobileAuthCredentialSubject,
  enforceMobileAuthRateLimit,
  type MobileAuthRateLimitSubject,
} from "../rate-limit";

export type MobileAuthRevokeRouteDependencies = {
  enforceRateLimit(request: Request, subject: MobileAuthRateLimitSubject): Promise<void>;
  getAccessToken: typeof getBearerTokenFromRequest;
  parseRequest(request: Request): Promise<MobileAuthRevokeRequest>;
  revokeSession: typeof revokeMobileSession;
  verifyAccessToken: typeof verifyMobileAccessToken;
};

const defaultDependencies: MobileAuthRevokeRouteDependencies = {
  enforceRateLimit: (request, subject) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-revoke", subject),
  getAccessToken: getBearerTokenFromRequest,
  parseRequest: (request) => parseJsonBody(request, MobileAuthRevokeRequestSchema),
  revokeSession: revokeMobileSession,
  verifyAccessToken: verifyMobileAccessToken,
};

export async function mobileAuthRevokeRoute(
  request: Request,
  dependencies: MobileAuthRevokeRouteDependencies = defaultDependencies,
) {
  try {
    const body = await dependencies.parseRequest(request);
    const accessToken = dependencies.getAccessToken(request);
    const credential = body.refreshToken ?? accessToken ?? request.url;
    const credentialNamespace = body.refreshToken
      ? "refresh-token"
      : accessToken
        ? "access-token"
        : "revoke-request";
    await dependencies.enforceRateLimit(
      request,
      createMobileAuthCredentialSubject(credentialNamespace, credential),
    );
    let sessionId: string | null = null;

    if (accessToken) {
      try {
        sessionId = dependencies.verifyAccessToken(accessToken)?.sessionId ?? null;
      } catch {
        sessionId = null;
      }
    }

    await dependencies.revokeSession({
      refreshToken: body.refreshToken ?? null,
      sessionId,
    });

    return new Response(null, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
      status: 204,
    });
  } catch (error) {
    return jsonError(error);
  }
}
