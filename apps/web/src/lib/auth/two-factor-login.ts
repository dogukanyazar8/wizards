import {
  BackupCodeChallengeSchema,
  TwoFactorChallengeSchema,
  type BackupCodeChallengeInput,
  type TwoFactorChallengeInput,
} from "@wizards/types";

import { prisma } from "@wizards/db";

import {
  LOGIN_CREDENTIAL_USER_SELECT,
  type LoginCredentialUser,
} from "@/lib/auth/login-credentials";
import { createRequestFingerprint, loginChallengeStore } from "@/lib/auth/login-challenge";
import { createLoginLockout } from "@/lib/auth/login-lockout";
import { verifyTwoFactorCredential } from "@/lib/auth/two-factor";
import { issueTrustedDevice } from "./trusted-device";
import { logError } from "@/lib/logger";

/**
 * İkinci adımın saf iş mantığı — SPEC-GIRIS-KAYIT §4.2 ve §4.3.
 *
 * Sunucu eylemi (`"use server"`) değil: `signIn` çağrısı ve `headers()` okuması bir katman
 * yukarıda kalsın ki bu dosya test edilebilir olsun. Burada yalnız "challenge + kod → bilet"
 * dönüşümü var.
 */

export type TwoFactorLoginResult =
  | {
      email: string;
      redirectTo: string;
      status: "ok";
      ticket: string;
      trustedDeviceToken?: string;
    }
  | { attemptsLeft?: number; status: "codeInvalid" }
  | { retryAfterMs: number; status: "accountLocked" }
  | { status: "challengeExpired" | "unavailable" };

export type TwoFactorLoginDependencies = {
  challenges: typeof loginChallengeStore;
  findUser: (userId: string) => Promise<LoginCredentialUser | null>;
  lockout: ReturnType<typeof createLoginLockout>;
  verifyCode: typeof verifyTwoFactorCredential;
  issueTrustedDevice: typeof issueTrustedDevice;
};

const defaultDependencies: TwoFactorLoginDependencies = {
  challenges: loginChallengeStore,
  findUser: (userId) =>
    prisma.user.findUnique({
      select: LOGIN_CREDENTIAL_USER_SELECT,
      where: { id: userId },
    }) as Promise<LoginCredentialUser | null>,
  lockout: createLoginLockout(),
  verifyCode: verifyTwoFactorCredential,
  issueTrustedDevice,
};

export type TwoFactorRequestContext = {
  clientIp?: string | null;
  userAgent?: string | null;
};

async function completeSecondStep(
  input: { challengeId: string; code: string; rememberDevice?: boolean },
  context: TwoFactorRequestContext,
  overrides: Partial<TwoFactorLoginDependencies>,
): Promise<TwoFactorLoginResult> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const fingerprint = createRequestFingerprint(context);
  const challenge = await dependencies.challenges.peek(input.challengeId, fingerprint);

  if (!challenge) {
    return { status: "challengeExpired" };
  }

  const user = await dependencies.findUser(challenge.userId);

  if (!user || user.isBanned || user.deletedAt || !user.emailVerified || !user.twoFactorEnabled) {
    return { status: "challengeExpired" };
  }

  const verification = await dependencies.verifyCode({
    code: input.code,
    secret: user.twoFactorSecret,
    secretCiphertext: user.twoFactorSecretCiphertext,
    secretKeyVersion: user.twoFactorSecretKeyVersion,
    userId: user.id,
  });

  if (!verification.success) {
    if (verification.error === "verification_unavailable") {
      return { status: "unavailable" };
    }

    /*
     * Yanlış kod hem challenge sayacını hem giriş kilidini besler. Kilit olmasaydı, parolayı
     * bilen biri sınırsız challenge üretip ikinci adımı sonsuza kadar deneyebilirdi.
     */
    const failure = await dependencies.lockout.registerFailure({
      clientIp: context.clientIp ?? null,
      email: challenge.email,
    });
    const challengeFailure = await dependencies.challenges.registerCodeFailure(
      input.challengeId,
      fingerprint,
    );

    if (failure.status === "locked") {
      return { retryAfterMs: failure.retryAfterMs, status: "accountLocked" };
    }

    if (challengeFailure.status === "retry") {
      return { attemptsLeft: challengeFailure.attemptsLeft, status: "codeInvalid" };
    }

    return { status: "challengeExpired" };
  }

  const consumed = await dependencies.challenges.consume(input.challengeId, fingerprint);

  if (!consumed) {
    return { status: "challengeExpired" };
  }

  const ticket = await dependencies.challenges.issueTicket(consumed);
  let trustedDeviceToken: string | undefined;
  if (input.rememberDevice) {
    try {
      trustedDeviceToken = await dependencies.issueTrustedDevice(user, context.userAgent);
    } catch (error) {
      logError("[auth] Failed to remember verified device", error);
      return { status: "unavailable" };
    }
  }
  await dependencies.lockout.reset({
    clientIp: context.clientIp ?? null,
    email: consumed.email,
  });

  return {
    email: consumed.email,
    redirectTo: consumed.redirectTo,
    status: "ok",
    ticket,
    ...(trustedDeviceToken ? { trustedDeviceToken } : {}),
  };
}

/** SPEC §4.2 — kimlik doğrulama uygulamasındaki 6 haneli kod. */
export async function submitTwoFactorCode(
  input: TwoFactorChallengeInput,
  context: TwoFactorRequestContext,
  overrides: Partial<TwoFactorLoginDependencies> = {},
): Promise<TwoFactorLoginResult> {
  return completeSecondStep(
    { challengeId: input.challengeId, code: input.code, rememberDevice: input.rememberDevice },
    context,
    overrides,
  );
}

/** SPEC §4.3 — tek kullanımlık yedek kod. Doğrulama yolu aynı servisten geçer. */
export async function submitBackupCode(
  input: BackupCodeChallengeInput,
  context: TwoFactorRequestContext,
  overrides: Partial<TwoFactorLoginDependencies> = {},
): Promise<TwoFactorLoginResult> {
  return completeSecondStep(
    {
      challengeId: input.challengeId,
      code: input.backupCode,
      rememberDevice: input.rememberDevice === true,
    },
    context,
    overrides,
  );
}

export { BackupCodeChallengeSchema, TwoFactorChallengeSchema };
