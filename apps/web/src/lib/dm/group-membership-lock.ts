import type { Prisma } from "@wizards/db";

/** Serializes roster-changing transactions for one conversation. */
export async function serializeGroupMembershipWrite(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  conversationId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${conversationId}, 0))`;
}
