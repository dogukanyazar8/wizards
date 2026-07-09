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

const TWO_FACTOR_ISSUER = "Whispr";
const TWO_FACTOR_RECOVERY_CODE_COUNT = 10;
const TWO_FACTOR_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const TWO_FACTOR_FREE_FAILURES = 4;
const TWO_FACTOR_INITIAL_BACKOFF_MS = 30 * 1000;
const TWO_FACTOR_MAX_BACKOFF_MS = 15 * 60 * 1000;

type TwoFactorAttemptState = {
  failures: number;
  lockedUntilMs: number | null;
};

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
};

export type TwoFactorRepository = {
  consumeRecoveryCode: (codeId: string) => Promise<boolean>;
  disableTwoFactor: (userId: string) => Promise<void>;
  enableTwoFactor: (
    userId: string,
    secret: string,
    recoveryCodeHashes: string[],
  ) => Promise<void>;
  findUserForTwoFactor: (userId: string) => Promise<TwoFactorUserRecord | null>;
  listUnusedRecoveryCodes: (userId: string) => Promise<TwoFactorRecoveryCodeRecord[]>;
  savePendingSecret: (userId: string, secret: string) => Promise<void>;
};

export type TwoFactorAttemptStore = {
  del: (key: string) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: "EX", seconds: number) => Promise<unknown>;
};

export type TwoFactorServiceDependencies = {
  attemptStore?: TwoFactorAttemptStore;
  comparePassword?: (password: string, passwordHash: string) => Promise<boolean>;
  createQrCodeDataUrl?: (otpauthUri: string) => Promise<string>;
  nowMs?: () => number;
  randomBytes?: (size: number) => Buffer;
  repository?: TwoFactorRepository;
};

type TwoFactorError =
  | "already_enabled"
  | "invalid_code"
  | "invalid_credentials"
  | "not_enabled"
  | "not_found"
  | "rate_limited"
  | "setup_required";

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
  const values = new Map<string, string>();

  return {
    async del(key) {
      values.delete(key);
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
    },
  };
}

function getTwoFactorAttemptKey(userId: string) {
  return `rate:two-factor:account:${userId}`;
}

function getTwoFactorBackoffMs(failures: number) {
  if (failures <= TWO_FACTOR_FREE_FAILURES) {
    return 0;
  }

  const exponent = Math.min(failures - TWO_FACTOR_FREE_FAILURES - 1, 8);
  return Math.min(
    TWO_FACTOR_INITIAL_BACKOFF_MS * 2 ** exponent,
    TWO_FACTOR_MAX_BACKOFF_MS,
  );
}

function parseAttemptState(rawValue: string | null): TwoFactorAttemptState {
  if (!rawValue) {
    return { failures: 0, lockedUntilMs: null };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<TwoFactorAttemptState>;
    return {
      failures: Number.isInteger(parsed.failures) ? Math.max(0, parsed.failures ?? 0) : 0,
      lockedUntilMs:
        typeof parsed.lockedUntilMs === "number" && Number.isFinite(parsed.lockedUntilMs)
          ? parsed.lockedUntilMs
          : null,
    };
  } catch {
    return { failures: 0, lockedUntilMs: null };
  }
}

async function readAttemptState(store: TwoFactorAttemptStore, userId: string) {
  return parseAttemptState(await store.get(getTwoFactorAttemptKey(userId)));
}

async function writeAttemptState(
  store: TwoFactorAttemptStore,
  userId: string,
  state: TwoFactorAttemptState,
) {
  await store.set(
    getTwoFactorAttemptKey(userId),
    JSON.stringify(state),
    "EX",
    TWO_FACTOR_ATTEMPT_WINDOW_SECONDS,
  );
}

async function assertAttemptAllowed(args: {
  nowMs: number;
  store: TwoFactorAttemptStore;
  userId: string;
}): Promise<TwoFactorSuccessResult | TwoFactorFailureResult> {
  const state = await readAttemptState(args.store, args.userId);
  if (state.lockedUntilMs && state.lockedUntilMs > args.nowMs) {
    return {
      error: "rate_limited",
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockedUntilMs - args.nowMs) / 1000)),
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
  const previous = await readAttemptState(args.store, args.userId);
  const failures = previous.failures + 1;
  const backoffMs = getTwoFactorBackoffMs(failures);
  const lockedUntilMs = backoffMs > 0 ? args.nowMs + backoffMs : null;

  await writeAttemptState(args.store, args.userId, {
    failures,
    lockedUntilMs,
  });

  if (lockedUntilMs) {
    return {
      error: "rate_limited",
      retryAfterSeconds: Math.ceil(backoffMs / 1000),
      success: false,
    };
  }

  return { error: "invalid_code", success: false };
}

async function resetAttemptFailures(store: TwoFactorAttemptStore, userId: string) {
  await store.del(getTwoFactorAttemptKey(userId));
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
          twoFactorSecret: secret,
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
        twoFactorSecret: secret,
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
  const redis = getRedisRate();

  return {
    del: (key) => redis.del(key),
    get: (key) => redis.get(key),
    set: (key, value, mode, seconds) => redis.set(key, value, mode, seconds),
  };
}

function resolveDependencies(dependencies: TwoFactorServiceDependencies = {}) {
  return {
    attemptStore: dependencies.attemptStore ?? getDefaultAttemptStore(),
    comparePassword: dependencies.comparePassword ?? bcrypt.compare,
    createQrCodeDataUrl: dependencies.createQrCodeDataUrl ?? createDefaultQrCodeDataUrl,
    nowMs: dependencies.nowMs ?? Date.now,
    randomBytes: dependencies.randomBytes ?? cryptoRandomBytes,
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
  await deps.repository.savePendingSecret(userId, setup.secret);

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

  if (!user.twoFactorSecret) {
    return { error: "setup_required", success: false };
  }

  if (
    !hasUsableCode(input.code) ||
    !verifyTotpCode(user.twoFactorSecret, input.code.trim(), { nowMs })
  ) {
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
  await deps.repository.enableTwoFactor(
    input.userId,
    user.twoFactorSecret,
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

  if (!input.secret || !hasUsableCode(input.code)) {
    return recordAttemptFailure({
      nowMs,
      store: deps.attemptStore,
      userId: input.userId,
    });
  }

  const trimmedCode = input.code.trim();
  const isTotpValid = verifyTotpCode(input.secret, trimmedCode, { nowMs });
  const isRecoveryCodeValid = isTotpValid
    ? false
    : await verifyRecoveryCodeCredential({
        code: trimmedCode,
        repository: deps.repository,
        userId: input.userId,
      });

  if (!isTotpValid && !isRecoveryCodeValid) {
    return recordAttemptFailure({
      nowMs,
      store: deps.attemptStore,
      userId: input.userId,
    });
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

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    return { error: "not_enabled", success: false };
  }

  if (!user.passwordHash || !(await deps.comparePassword(input.password, user.passwordHash))) {
    return { error: "invalid_credentials", success: false };
  }

  const secondFactor = await verifyTwoFactorCredential(
    {
      code: input.code,
      secret: user.twoFactorSecret,
      userId: input.userId,
    },
    deps,
  );

  if (!secondFactor.success) {
    return secondFactor.error === "rate_limited"
      ? secondFactor
      : { error: "invalid_code", success: false };
  }

  await deps.repository.disableTwoFactor(input.userId);
  await resetAttemptFailures(deps.attemptStore, input.userId);

  return { success: true };
}
