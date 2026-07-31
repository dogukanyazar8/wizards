import { randomBytes as cryptoRandomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { prisma } from "@wizards/db";
import { getRedisRate } from "@/lib/redis";
import {
  createTotpSetup,
  generateRecoveryCodes,
  verifyRecoveryCode,
  verifyTotpCode,
  type RecoveryCode,
} from "./totp";
import {
  encryptTotpSecret,
  parseTotpSecretKeyring,
  resolveTotpSecret,
  type EncryptedTotpSecret,
  type TotpSecretKeyring,
} from "./totp-secret-encryption";
import { createRedisTotpReplayStore, type TotpReplayStore } from "./totp-replay";
import {
  createAttemptTracker,
  createMemoryAttemptStore,
  createRedisAttemptStore,
  type AttemptStore,
} from "./attempt-tracker";

const TWO_FACTOR_ISSUER = "Whispr";
const TWO_FACTOR_RECOVERY_CODE_COUNT = 10;
const TWO_FACTOR_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const TWO_FACTOR_FREE_FAILURES = 4;
const TWO_FACTOR_INITIAL_BACKOFF_MS = 30 * 1000;
const TWO_FACTOR_MAX_BACKOFF_MS = 15 * 60 * 1000;
const twoFactorAttemptTracker = createAttemptTracker({
  freeFailures: TWO_FACTOR_FREE_FAILURES,
  initialBackoffMs: TWO_FACTOR_INITIAL_BACKOFF_MS,
  keyPrefix: "rate:two-factor:account",
  maxBackoffMs: TWO_FACTOR_MAX_BACKOFF_MS,
  windowSeconds: TWO_FACTOR_ATTEMPT_WINDOW_SECONDS,
});

export type TwoFactorRecoveryCodeRecord = {
  codeHash: string;
  id: string;
  usedAt: Date | null;
};

export type TwoFactorUserRecord = {
  email: string;
  id: string;
  passwordHash: string | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorSecretCiphertext: string | null;
  twoFactorSecretKeyVersion: string | null;
};

export type TwoFactorSecretWrite = EncryptedTotpSecret;

export type TwoFactorRepository = {
  consumeRecoveryCode: (codeId: string) => Promise<boolean>;
  disableTwoFactor: (userId: string) => Promise<void>;
  enableTwoFactor: (
    userId: string,
    secret: TwoFactorSecretWrite,
    recoveryCodeHashes: string[],
  ) => Promise<void>;
  findUserForTwoFactor: (userId: string) => Promise<TwoFactorUserRecord | null>;
  listUnusedRecoveryCodes: (userId: string) => Promise<TwoFactorRecoveryCodeRecord[]>;
  savePendingSecret: (userId: string, secret: TwoFactorSecretWrite) => Promise<void>;
};

export type TwoFactorAttemptStore = AttemptStore;

export type TwoFactorServiceDependencies = {
  attemptStore?: TwoFactorAttemptStore;
  comparePassword?: (password: string, passwordHash: string) => Promise<boolean>;
  createQrCodeDataUrl?: (otpauthUri: string) => Promise<string>;
  keyring?: TotpSecretKeyring;
  nowMs?: () => number;
  randomBytes?: (size: number) => Buffer;
  replayStore?: TotpReplayStore;
  repository?: TwoFactorRepository;
};

type TwoFactorError =
  | "already_enabled"
  | "invalid_code"
  | "invalid_credentials"
  | "not_enabled"
  | "not_found"
  | "rate_limited"
  | "setup_required"
  | "verification_unavailable";

export type TwoFactorFailureResult = {
  error: TwoFactorError;
  retryAfterSeconds?: number;
  success: false;
};

export type TwoFactorSuccessResult = {
  success: true;
};

export type StartTwoFactorSetupResult =
  | (TwoFactorSuccessResult & {
      manualEntryKey: string;
      otpauthUri: string;
      qrCodeDataUrl: string;
    })
  | TwoFactorFailureResult;

export type ConfirmTwoFactorSetupResult =
  | (TwoFactorSuccessResult & {
      recoveryCodes: string[];
    })
  | TwoFactorFailureResult;

export type VerifyTwoFactorCredentialResult = TwoFactorSuccessResult | TwoFactorFailureResult;

export function createMemoryTwoFactorAttemptStore(): TwoFactorAttemptStore {
  return createMemoryAttemptStore();
}

async function assertAttemptAllowed(args: {
  nowMs: number;
  store: TwoFactorAttemptStore;
  userId: string;
}): Promise<TwoFactorSuccessResult | TwoFactorFailureResult> {
  const result = await twoFactorAttemptTracker.assertAllowed({
    identifier: args.userId,
    nowMs: args.nowMs,
    store: args.store,
  });
  if (!result.allowed) {
    return {
      error: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
      success: false,
    };
  }

  return { success: true };
}

async function recordAttemptFailure(args: {
  nowMs: number;
  store: TwoFactorAttemptStore;
  userId: string;
}): Promise<TwoFactorFailureResult> {
  const result = await twoFactorAttemptTracker.recordFailure({
    identifier: args.userId,
    nowMs: args.nowMs,
    store: args.store,
  });
  if (result.locked) {
    return {
      error: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
      success: false,
    };
  }

  return { error: "invalid_code", success: false };
}

async function resetAttemptFailures(store: TwoFactorAttemptStore, userId: string) {
  await twoFactorAttemptTracker.resetFailures({ identifier: userId, store });
}

const defaultTwoFactorRepository: TwoFactorRepository = {
  async consumeRecoveryCode(codeId) {
    const result = await prisma.twoFactorRecoveryCode.updateMany({
      data: { usedAt: new Date() },
      where: {
        id: codeId,
        usedAt: null,
      },
    });

    return result.count === 1;
  },
  async disableTwoFactor(userId) {
    await prisma.$transaction(async (tx) => {
      await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
      await tx.user.update({
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorSecretCiphertext: null,
          twoFactorSecretKeyVersion: null,
        },
        where: { id: userId },
      });
    });
  },
  async enableTwoFactor(userId, secret, recoveryCodeHashes) {
    await prisma.$transaction(async (tx) => {
      await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
      await tx.user.update({
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: null,
          twoFactorSecretCiphertext: secret.ciphertext,
          twoFactorSecretKeyVersion: secret.keyVersion,
        },
        where: { id: userId },
      });
      await tx.twoFactorRecoveryCode.createMany({
        data: recoveryCodeHashes.map((codeHash) => ({
          codeHash,
          userId,
        })),
      });
    });
  },
  async findUserForTwoFactor(userId) {
    return prisma.user.findUnique({
      select: {
        email: true,
        id: true,
        passwordHash: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorSecretCiphertext: true,
        twoFactorSecretKeyVersion: true,
      },
      where: { id: userId },
    });
  },
  async listUnusedRecoveryCodes(userId) {
    return prisma.twoFactorRecoveryCode.findMany({
      select: {
        codeHash: true,
        id: true,
        usedAt: true,
      },
      where: {
        userId,
        usedAt: null,
      },
    });
  },
  async savePendingSecret(userId, secret) {
    await prisma.user.update({
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorSecretCiphertext: secret.ciphertext,
        twoFactorSecretKeyVersion: secret.keyVersion,
      },
      where: { id: userId },
    });
  },
};

async function createDefaultQrCodeDataUrl(otpauthUri: string) {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 5,
  });
}

function getDefaultAttemptStore(): TwoFactorAttemptStore {
  return createRedisAttemptStore(getRedisRate());
}

function resolveDependencies(dependencies: TwoFactorServiceDependencies = {}) {
  return {
    attemptStore: dependencies.attemptStore ?? getDefaultAttemptStore(),
    comparePassword: dependencies.comparePassword ?? bcrypt.compare,
    createQrCodeDataUrl: dependencies.createQrCodeDataUrl ?? createDefaultQrCodeDataUrl,
    keyring: dependencies.keyring ?? parseTotpSecretKeyring(),
    nowMs: dependencies.nowMs ?? Date.now,
    randomBytes: dependencies.randomBytes ?? cryptoRandomBytes,
    replayStore: dependencies.replayStore ?? createRedisTotpReplayStore(getRedisRate()),
    repository: dependencies.repository ?? defaultTwoFactorRepository,
  };
}

function hasUsableCode(code: string) {
  return code.trim().length > 0 && code.trim().length <= 64;
}

async function verifyRecoveryCodeCredential(args: {
  code: string;
  repository: TwoFactorRepository;
  userId: string;
}) {
  const recoveryCodes = await args.repository.listUnusedRecoveryCodes(args.userId);
  for (const recoveryCode of recoveryCodes) {
    if (!verifyRecoveryCode(args.code, recoveryCode.codeHash)) {
      continue;
    }

    if (await args.repository.consumeRecoveryCode(recoveryCode.id)) {
      return true;
    }
  }

  return false;
}

function mapRecoveryCodeHashes(codes: RecoveryCode[]) {
  return codes.map((entry) => entry.hash);
}

async function consumeTotpMatch(args: {
  counter: number;
  replayStore: TotpReplayStore;
  userId: string;
}) {
  try {
    return await args.replayStore.consume({
      counter: args.counter,
      userId: args.userId,
    });
  } catch {
    return null;
  }
}

export async function startTwoFactorSetup(
  userId: string,
  dependencies?: TwoFactorServiceDependencies,
): Promise<StartTwoFactorSetupResult> {
  const deps = resolveDependencies(dependencies);
  const user = await deps.repository.findUserForTwoFactor(userId);

  if (!user) {
    return { error: "not_found", success: false };
  }

  if (user.twoFactorEnabled) {
    return { error: "already_enabled", success: false };
  }

  const setup = createTotpSetup({
    accountName: user.email,
    issuer: TWO_FACTOR_ISSUER,
    randomBytes: deps.randomBytes,
  });
  const encryptedSecret = encryptTotpSecret({
    keyring: deps.keyring,
    plaintext: setup.secret,
    userId,
  });
  await deps.repository.savePendingSecret(userId, {
    ...encryptedSecret,
  });

  return {
    manualEntryKey: setup.manualEntryKey,
    otpauthUri: setup.otpauthUri,
    qrCodeDataUrl: await deps.createQrCodeDataUrl(setup.otpauthUri),
    success: true,
  };
}

export async function confirmTwoFactorSetup(
  input: { code: string; userId: string },
  dependencies?: TwoFactorServiceDependencies,
): Promise<ConfirmTwoFactorSetupResult> {
  const deps = resolveDependencies(dependencies);
  const nowMs = deps.nowMs();
  const allowed = await assertAttemptAllowed({
    nowMs,
    store: deps.attemptStore,
    userId: input.userId,
  });
  if (!allowed.success) {
    return allowed;
  }

  const user = await deps.repository.findUserForTwoFactor(input.userId);
  if (!user) {
    return { error: "not_found", success: false };
  }

  if (user.twoFactorEnabled) {
    return { error: "already_enabled", success: false };
  }

  const secret = resolveTotpSecret(user, input.userId, deps.keyring);
  if (!secret) {
    return { error: "setup_required", success: false };
  }

  const totpMatch = hasUsableCode(input.code)
    ? verifyTotpCode(secret, input.code.trim(), { nowMs })
    : null;
  if (!totpMatch) {
    return recordAttemptFailure({
      nowMs,
      store: deps.attemptStore,
      userId: input.userId,
    });
  }
  const consumed = await consumeTotpMatch({
    counter: totpMatch.counter,
    replayStore: deps.replayStore,
    userId: input.userId,
  });
  if (consumed === null) {
    return { error: "verification_unavailable", success: false };
  }
  if (!consumed) {
    return recordAttemptFailure({
      nowMs,
      store: deps.attemptStore,
      userId: input.userId,
    });
  }

  const recoveryCodes = generateRecoveryCodes({
    count: TWO_FACTOR_RECOVERY_CODE_COUNT,
    randomBytes: deps.randomBytes,
  });
  const encryptedSecret = encryptTotpSecret({
    keyring: deps.keyring,
    plaintext: secret,
    userId: input.userId,
  });
  await deps.repository.enableTwoFactor(
    input.userId,
    {
      ...encryptedSecret,
    },
    mapRecoveryCodeHashes(recoveryCodes),
  );
  await resetAttemptFailures(deps.attemptStore, input.userId);

  return {
    recoveryCodes: recoveryCodes.map((entry) => entry.plaintext),
    success: true,
  };
}

export async function verifyTwoFactorCredential(
  input: {
    code: string;
    secret: string | null | undefined;
    secretCiphertext?: string | null;
    secretKeyVersion?: string | null;
    userId: string;
  },
  dependencies?: TwoFactorServiceDependencies,
): Promise<VerifyTwoFactorCredentialResult> {
  const deps = resolveDependencies(dependencies);
  const nowMs = deps.nowMs();
  const allowed = await assertAttemptAllowed({
    nowMs,
    store: deps.attemptStore,
    userId: input.userId,
  });
  if (!allowed.success) {
    return allowed;
  }

  const secret = resolveTotpSecret(
    {
      ...(input.secret === undefined ? {} : { twoFactorSecret: input.secret }),
      ...(input.secretCiphertext === undefined
        ? {}
        : { twoFactorSecretCiphertext: input.secretCiphertext }),
      ...(input.secretKeyVersion === undefined
        ? {}
        : { twoFactorSecretKeyVersion: input.secretKeyVersion }),
    },
    input.userId,
    deps.keyring,
  );
  if (!secret || !hasUsableCode(input.code)) {
    return recordAttemptFailure({
      nowMs,
      store: deps.attemptStore,
      userId: input.userId,
    });
  }

  const trimmedCode = input.code.trim();
  const totpMatch = verifyTotpCode(secret, trimmedCode, { nowMs });
  const isRecoveryCodeValid = totpMatch
    ? false
    : await verifyRecoveryCodeCredential({
        code: trimmedCode,
        repository: deps.repository,
        userId: input.userId,
      });

  if (!totpMatch && !isRecoveryCodeValid) {
    return recordAttemptFailure({
      nowMs,
      store: deps.attemptStore,
      userId: input.userId,
    });
  }
  if (totpMatch) {
    const consumed = await consumeTotpMatch({
      counter: totpMatch.counter,
      replayStore: deps.replayStore,
      userId: input.userId,
    });
    if (consumed === null) {
      return { error: "verification_unavailable", success: false };
    }
    if (!consumed) {
      return recordAttemptFailure({
        nowMs,
        store: deps.attemptStore,
        userId: input.userId,
      });
    }
  }

  await resetAttemptFailures(deps.attemptStore, input.userId);

  return { success: true };
}

export async function disableTwoFactor(
  input: {
    code: string;
    password: string;
    userId: string;
  },
  dependencies?: TwoFactorServiceDependencies,
): Promise<TwoFactorSuccessResult | TwoFactorFailureResult> {
  const deps = resolveDependencies(dependencies);
  const user = await deps.repository.findUserForTwoFactor(input.userId);
  if (!user) {
    return { error: "not_found", success: false };
  }

  if (!user.twoFactorEnabled) {
    return { error: "not_enabled", success: false };
  }
  const secret = resolveTotpSecret(user, input.userId, deps.keyring);
  if (!secret) {
    return { error: "not_enabled", success: false };
  }

  if (!user.passwordHash || !(await deps.comparePassword(input.password, user.passwordHash))) {
    return { error: "invalid_credentials", success: false };
  }

  const secondFactor = await verifyTwoFactorCredential(
    {
      code: input.code,
      secret,
      userId: input.userId,
    },
    deps,
  );

  if (!secondFactor.success) {
    return secondFactor.error === "rate_limited" ||
      secondFactor.error === "verification_unavailable"
      ? secondFactor
      : { error: "invalid_code", success: false };
  }

  await deps.repository.disableTwoFactor(input.userId);
  await resetAttemptFailures(deps.attemptStore, input.userId);

  return { success: true };
}
