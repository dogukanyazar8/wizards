import { prisma, type Prisma } from "@wizards/db";

import {
  parseTotpSecretMaintenanceArgs,
  runTotpSecretMaintenance,
  type TotpSecretMaintenanceRepository,
} from "../src/lib/auth/totp-secret-backfill";
import { parseTotpSecretKeyring } from "../src/lib/auth/totp-secret-encryption";

const repository: TotpSecretMaintenanceRepository = {
  async listCandidates(input) {
    let modeFilter: Prisma.UserWhereInput;
    if (input.mode === "backfill") {
      modeFilter = {
        twoFactorSecret: { not: null },
      };
    } else if (input.mode === "rotate") {
      modeFilter = {
        AND: [
          { twoFactorSecretCiphertext: { not: null } },
          {
            OR: [
              { twoFactorSecretKeyVersion: null },
              { twoFactorSecretKeyVersion: { not: input.activeKeyVersion } },
            ],
          },
        ],
      };
    } else {
      modeFilter = {
        OR: [{ twoFactorSecret: { not: null } }, { twoFactorSecretCiphertext: { not: null } }],
      };
    }

    return prisma.user.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        twoFactorSecret: true,
        twoFactorSecretCiphertext: true,
        twoFactorSecretKeyVersion: true,
      },
      take: input.batchSize,
      where: {
        ...modeFilter,
        ...(input.afterId ? { id: { gt: input.afterId } } : {}),
      },
    });
  },
  async updateEncryptedSecret(input) {
    const result = await prisma.user.updateMany({
      data: {
        twoFactorSecret: null,
        twoFactorSecretCiphertext: input.ciphertext,
        twoFactorSecretKeyVersion: input.keyVersion,
      },
      where: {
        id: input.id,
        twoFactorSecret: input.expectedPlaintext,
        twoFactorSecretCiphertext: input.expectedCiphertext,
        twoFactorSecretKeyVersion: input.expectedKeyVersion,
      },
    });
    return result.count === 1;
  },
};

async function main() {
  const { confirmed: _confirmed, ...args } = parseTotpSecretMaintenanceArgs(process.argv.slice(2));
  const summary = await runTotpSecretMaintenance({
    ...args,
    keyring: parseTotpSecretKeyring(),
    repository,
  });
  console.info(JSON.stringify(summary));
  if (summary.failed > 0 || summary.conflicts > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "TOTP secret maintenance failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
