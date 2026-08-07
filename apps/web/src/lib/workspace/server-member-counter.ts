import { Prisma } from "@wizards/db";

/**
 * Narrow enough that a transaction client, the base client, and a test double
 * all satisfy it. The counter is written from six call sites, so it lives in
 * one module rather than being repeated at each of them.
 */
export type ServerMemberCounterClient = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  server: { update: (args: never) => Promise<unknown> };
};

export async function incrementServerMemberCount(
  client: ServerMemberCounterClient,
  serverId: string,
): Promise<void> {
  await client.server.update({
    data: { memberCount: { increment: 1 } },
    where: { id: serverId },
  } as never);
}

/**
 * Prisma's `decrement` happily writes -1. A membership row can be removed by
 * more than one path (leave, kick, ban, account deletion), so the floor is
 * enforced in SQL instead of trusted at each call site.
 */
export async function decrementServerMemberCount(
  client: ServerMemberCounterClient,
  serverId: string,
): Promise<void> {
  await client.$executeRaw`
    UPDATE "Server"
    SET "memberCount" = GREATEST(0, "memberCount" - 1)
    WHERE "id" = ${serverId}
  `;
}

export async function decrementServerMemberCounts(
  client: ServerMemberCounterClient,
  serverIds: readonly string[],
): Promise<void> {
  if (serverIds.length === 0) {
    return;
  }

  await client.$executeRaw`
    UPDATE "Server"
    SET "memberCount" = GREATEST(0, "memberCount" - 1)
    WHERE "id" IN (${Prisma.join([...serverIds])})
  `;
}

/** Repair path for drift. Not scheduled anywhere in S1 — callable on demand. */
export async function recomputeServerMemberCount(
  client: ServerMemberCounterClient,
  serverId: string,
): Promise<void> {
  await client.$executeRaw`
    UPDATE "Server" s
    SET "memberCount" = (
      SELECT COUNT(*) FROM "ServerMember" m WHERE m."serverId" = s."id"
    )
    WHERE s."id" = ${serverId}
  `;
}
