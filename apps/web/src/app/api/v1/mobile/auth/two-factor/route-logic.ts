import {
  MobileAuthBackupCodeRequestSchema,
  MobileAuthTwoFactorRequestSchema,
  type MobileAuthBackupCodeRequest,
  type MobileAuthTwoFactorRequest,
} from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { createRequestFingerprint } from "@/lib/auth/login-challenge";
import { completeMobileTwoFactorChallenge, MobileNativeAuthError } from "@/lib/mobile/auth";
import { resolveTrustedProxyClientIp } from "@/lib/security/client-ip";
import { enforceMobileAuthRateLimit, type MobileAuthRateLimitSubject } from "../rate-limit";

/**
 * SPEC-GIRIS-KAYIT §4.2 ve §4.3 — mobilde ikinci adım (paket kararı K2).
 *
 * Parola bu uçlara hiç gelmez: istemci giriş isteğinden aldığı challenge kimliğini ve kodu
 * gönderir. Challenge tek kullanımlıktır, beş dakikada düşer ve isteğin IP + User-Agent parmak
 * izine bağlıdır — başka bir cihazdan çalışmaz.
 */

export type MobileTwoFactorRouteDependencies = {
  completeChallenge: typeof completeMobileTwoFactorChallenge;
  enforceRateLimit: (request: Request, subject: MobileAuthRateLimitSubject) => Promise<void>;
};

const defaultDependencies: MobileTwoFactorRouteDependencies = {
  completeChallenge: completeMobileTwoFactorChallenge,
  enforceRateLimit: (request, subject) =>
    enforceMobileAuthRateLimit(request, "mobile:auth-login", subject),
};

function readRequestFingerprint(request: Request) {
  return createRequestFingerprint({
    clientIp: resolveTrustedProxyClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
  });
}

async function completeSecondStep(
  request: Request,
  input: { challengeId: string; code: string },
  dependencies: MobileTwoFactorRouteDependencies,
) {
  await dependencies.enforceRateLimit(request, {
    namespace: "two-factor-challenge",
    value: input.challengeId,
  });

  const response = await dependencies.completeChallenge(input, {
    requestFingerprint: readRequestFingerprint(request),
  });

  if (!response) {
    throw new ApiError("Invalid verification code.", 401, "TWO_FACTOR_INVALID");
  }

  return Response.json(response, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

export async function mobileTwoFactorRoute(
  request: Request,
  dependencies: MobileTwoFactorRouteDependencies = defaultDependencies,
) {
  try {
    const body: MobileAuthTwoFactorRequest = await parseJsonBody(
      request,
      MobileAuthTwoFactorRequestSchema,
    );

    return await completeSecondStep(
      request,
      { challengeId: body.challengeId, code: body.code },
      dependencies,
    );
  } catch (error) {
    if (error instanceof MobileNativeAuthError) {
      return jsonError(new ApiError(error.message, error.status, error.code));
    }

    return jsonError(error);
  }
}

export async function mobileBackupCodeRoute(
  request: Request,
  dependencies: MobileTwoFactorRouteDependencies = defaultDependencies,
) {
  try {
    const body: MobileAuthBackupCodeRequest = await parseJsonBody(
      request,
      MobileAuthBackupCodeRequestSchema,
    );

    return await completeSecondStep(
      request,
      { challengeId: body.challengeId, code: body.backupCode },
      dependencies,
    );
  } catch (error) {
    if (error instanceof MobileNativeAuthError) {
      return jsonError(new ApiError(error.message, error.status, error.code));
    }

    return jsonError(error);
  }
}
