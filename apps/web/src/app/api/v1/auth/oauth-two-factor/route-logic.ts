import { z } from "zod";
import { getTrustedDeviceCookieConfig } from "@/lib/auth/trusted-device";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  createNetworkRateLimitIdentity,
  createSubjectRateLimitIdentity,
} from "@/lib/security/client-ip";
import {
  completeOAuthTwoFactorChallenge,
  getOAuthTwoFactorGrantCookieConfig,
  hashOAuthTwoFactorToken,
  OAuthTwoFactorError,
} from "@/lib/auth/oauth-two-factor";

export const OAuthTwoFactorRequestSchema = z.object({
  challengeToken: z
    .string()
    .trim()
    .min(16)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
  twoFactorCode: z.string().trim().min(1).max(64),
  rememberDevice: z.boolean().optional(),
});

type OAuthTwoFactorRequest = z.infer<typeof OAuthTwoFactorRequestSchema>;

export function getOAuthTwoFactorRateLimitIdentities(
  request: Request,
  challengeFingerprint: string,
) {
  const networkIdentity = createNetworkRateLimitIdentity({
    headers: request.headers,
  });
  const subjectIdentity = createSubjectRateLimitIdentity(
    "oauth-two-factor-challenge",
    challengeFingerprint,
  );
  return [`network:${networkIdentity}`, `subject:${subjectIdentity}`] as const;
}

export type OAuthTwoFactorRouteDependencies = {
  completeChallenge: typeof completeOAuthTwoFactorChallenge;
  enforceRateLimit: (request: Request, challengeFingerprint: string) => Promise<void>;
  getGrantCookieConfig: typeof getOAuthTwoFactorGrantCookieConfig;
  parseRequest: (request: Request) => Promise<OAuthTwoFactorRequest>;
};

const defaultDependencies: OAuthTwoFactorRouteDependencies = {
  completeChallenge: completeOAuthTwoFactorChallenge,
  enforceRateLimit: async (request, challengeFingerprint) => {
    await Promise.all(
      getOAuthTwoFactorRateLimitIdentities(request, challengeFingerprint).map((identity) =>
        enforceApiRateLimit(identity, "auth:oauth-two-factor"),
      ),
    );
  },
  getGrantCookieConfig: getOAuthTwoFactorGrantCookieConfig,
  parseRequest: (request) => parseJsonBody(request, OAuthTwoFactorRequestSchema),
};

function serializeGrantCookie(
  name: string,
  value: string,
  options: ReturnType<typeof getOAuthTwoFactorGrantCookieConfig>["options"],
) {
  return [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    `SameSite=${options.sameSite === "lax" ? "Lax" : options.sameSite}`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export async function oauthTwoFactorRoute(
  request: Request,
  dependencies: OAuthTwoFactorRouteDependencies = defaultDependencies,
) {
  try {
    const input = await dependencies.parseRequest(request);
    await dependencies.enforceRateLimit(request, hashOAuthTwoFactorToken(input.challengeToken));
    const result = await dependencies.completeChallenge({
      ...input,
      ...(input.rememberDevice ? { userAgent: request.headers.get("user-agent") } : {}),
    });
    const cookie = dependencies.getGrantCookieConfig();
    const response = Response.json(
      { provider: result.provider, success: true },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
    response.headers.append(
      "Set-Cookie",
      serializeGrantCookie(cookie.name, result.grantToken, cookie.options),
    );
    if (result.trustedDeviceToken) {
      const trusted = getTrustedDeviceCookieConfig();
      response.headers.append(
        "Set-Cookie",
        serializeGrantCookie(trusted.name, result.trustedDeviceToken, trusted.options),
      );
    }
    return response;
  } catch (error) {
    if (error instanceof OAuthTwoFactorError) {
      return jsonError(new ApiError(error.message, error.status, error.code));
    }
    return jsonError(error);
  }
}
