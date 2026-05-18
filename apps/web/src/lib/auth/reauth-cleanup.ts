import { prisma, type Prisma } from "@wizards/db";

export const ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type AccountReauthChallengeCleanupDelegate = {
  deleteMany(args: { where: Prisma.AccountReauthChallengeWhereInput }): Promise<{ count: number }>;
};

export type AccountReauthChallengeCleanupRecord = {
  expiresAt: Date;
  usedAt: Date | null;
};

export function getAccountReauthChallengeCleanupCutoff(
  now = new Date(),
  retentionMs = ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS,
) {
  return new Date(now.getTime() - retentionMs);
}

export function shouldDeleteAccountReauthChallenge(
  record: AccountReauthChallengeCleanupRecord,
  now = new Date(),
  retentionMs = ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS,
) {
  const cutoff = getAccountReauthChallengeCleanupCutoff(now, retentionMs);
  return record.usedAt ? record.usedAt < cutoff : record.expiresAt < cutoff;
}

export function buildAccountReauthChallengeCleanupWhere(
  now = new Date(),
  retentionMs = ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS,
): Prisma.AccountReauthChallengeWhereInput {
  const cutoff = getAccountReauthChallengeCleanupCutoff(now, retentionMs);

  return {
    OR: [
      {
        usedAt: {
          lt: cutoff,
        },
      },
      {
        expiresAt: {
          lt: cutoff,
        },
        usedAt: null,
      },
    ],
  };
}

export async function cleanupAccountReauthChallenges({
  delegate = prisma.accountReauthChallenge,
  now = new Date(),
  retentionMs = ACCOUNT_REAUTH_CHALLENGE_RETENTION_MS,
}: {
  delegate?: AccountReauthChallengeCleanupDelegate;
  now?: Date;
  retentionMs?: number;
} = {}) {
  const result = await delegate.deleteMany({
    where: buildAccountReauthChallengeCleanupWhere(now, retentionMs),
  });

  return result.count;
}
