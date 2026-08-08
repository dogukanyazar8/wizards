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
 * Atomically claims one server slot before a membership row is created. A
 * read followed by `increment` permits two concurrent joins to both observe
 * the last slot; this single predicate update serializes them on the Server
 * row, so exactly one transaction can proceed when the server is at capacity.
 */
export async function reserveServerMemberCapacity(
  client: ServerMemberCounterClient,
  serverId: string,
): Promise<boolean> {
  const affectedRows = await client.$executeRaw`
    UPDATE "Server"
    SET "memberCount" = "memberCount" + 1
    WHERE "id" = ${serverId}
      AND "memberCount" < "maxMembers"
  `;

  return affectedRows === 1;
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

export type ServerMemberCountRow = {
  readonly id: string;
  readonly memberCount: number;
  readonly name: string;
};

export type ServerMemberCountDrift = ServerMemberCountRow & { readonly actual: number };

/**
 * Pure half of the drift sweep: the maintenance script reads the stored
 * counters and the grouped membership totals, this decides which rows are
 * wrong. A server with no membership rows never appears in the grouped result,
 * so a missing entry means zero, not "skip".
 */
export function collectServerMemberCountDrift(
  servers: readonly ServerMemberCountRow[],
  actualCounts: ReadonlyMap<string, number>,
): ServerMemberCountDrift[] {
  return servers.flatMap((server) => {
    const actual = actualCounts.get(server.id) ?? 0;

    return actual === server.memberCount ? [] : [{ ...server, actual }];
  });
}

/** Repair path for drift. Called by the admin recount route and the sweep script. */
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
