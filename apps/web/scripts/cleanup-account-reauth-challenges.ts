import { prisma } from "@wizards/db";

import { cleanupAccountReauthChallenges } from "../src/lib/auth/reauth-cleanup";

try {
  const deletedCount = await cleanupAccountReauthChallenges();
  console.info(`[maintenance] Deleted ${deletedCount} stale account re-auth challenge(s).`);
} finally {
  await prisma.$disconnect();
}
