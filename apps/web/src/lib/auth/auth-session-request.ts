import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";
import { ensureAuthSession, type AuthSessionMetadata } from "@/lib/auth/auth-session-service";
import { MOBILE_REFRESH_TOKEN_TTL_SECONDS } from "@/lib/mobile/auth";

export function getAuthSessionMetadataFromHeaders(headers: Headers): AuthSessionMetadata {
  const info = getAnalyticsClientInfo(headers);
  return {
    appVersion: info.appVersion,
    browser: info.browser,
    clientType: info.clientType,
    countryCode: info.countryCode,
    deviceType: info.deviceType,
    os: info.os,
  };
}

export function ensureMobileRequestAuthSession(
  request: Request,
  context: { sessionId: string; userId: string },
) {
  const now = new Date();
  return ensureAuthSession({
    expiresAt: new Date(now.getTime() + MOBILE_REFRESH_TOKEN_TTL_SECONDS * 1_000),
    id: context.sessionId,
    metadata: getAuthSessionMetadataFromHeaders(request.headers),
    now,
    userId: context.userId,
  });
}
