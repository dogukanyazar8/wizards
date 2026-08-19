export const PERMISSION_CACHE_REVISION_JOB_TYPE = "PERMISSION_CACHE_REVISION";

export type AuthorizationRevision = {
  memberVersion: string;
  serverVersion: string;
};

type AuthorizationRevisionClient = Pick<
  Prisma.TransactionClient,
  "outboxJob" | "server" | "serverAuthorizationSubjectRevision"
>;

export function authorizationRevisionsEqual(
  left: AuthorizationRevision | undefined,
  right: AuthorizationRevision | undefined,
) {
  return Boolean(
    left &&
    right &&
    left.memberVersion === right.memberVersion &&
    left.serverVersion === right.serverVersion,
  );
}

async function enqueueRevisionPublication(
  client: AuthorizationRevisionClient,
  input: { idempotencyKey: string; payload: Record<string, string> },
) {
  await client.outboxJob.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      type: PERMISSION_CACHE_REVISION_JOB_TYPE,
    },
    update: {},
  });
}

export async function advanceServerAuthorizationRevision(
  client: AuthorizationRevisionClient,
  serverId: string,
) {
  const server = await client.server.update({
    data: { authorizationRevision: { increment: 1n } },
    select: { authorizationRevision: true },
    where: { id: serverId },
  });
  const serverVersion = server.authorizationRevision.toString();
  await enqueueRevisionPublication(client, {
    idempotencyKey: `permission-revision:server:${serverId}:${serverVersion}`,
    payload: { serverId, serverVersion },
  });
  return { serverId, serverVersion };
}

export async function advanceMemberAuthorizationRevision(
  client: AuthorizationRevisionClient,
  serverId: string,
  userId: string,
) {
  const subject = await client.serverAuthorizationSubjectRevision.upsert({
    where: { serverId_userId: { serverId, userId } },
    create: { revision: 1n, serverId, userId },
    update: { revision: { increment: 1n } },
    select: { revision: true },
  });
  const server = await client.server.findUnique({
    where: { id: serverId },
    select: {
      authorizationRevision: true,
    },
  });
  if (!server) {
    throw new Error(`Server ${serverId} disappeared while advancing authorization revision`);
  }

  const memberVersion = subject.revision.toString();
  const serverVersion = server.authorizationRevision.toString();
  await enqueueRevisionPublication(client, {
    idempotencyKey: `permission-revision:member:${serverId}:${userId}:${memberVersion}`,
    payload: { memberVersion, serverId, serverVersion, userId },
  });
  return { memberVersion, serverId, serverVersion, userId };
}

export async function readServerAuthorizationRevisions(
  client: AuthorizationRevisionClient,
  serverId: string,
  userIds: string[],
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const server = await client.server.findUnique({
    where: { id: serverId },
    select: {
      authorizationRevision: true,
      authorizationSubjectRevisions: {
        where: { userId: { in: uniqueUserIds } },
        select: { revision: true, userId: true },
      },
    },
  });
  if (!server) {
    return {
      revisionsByUser: new Map<string, AuthorizationRevision>(),
      serverExists: false,
    };
  }

  const memberRevisionByUserId = new Map(
    (server.authorizationSubjectRevisions ?? []).map((entry) => [
      entry.userId,
      entry.revision.toString(),
    ]),
  );
  const serverVersion = (server.authorizationRevision ?? 0n).toString();
  return {
    revisionsByUser: new Map<string, AuthorizationRevision>(
      uniqueUserIds.map((userId) => [
        userId,
        {
          memberVersion: memberRevisionByUserId.get(userId) ?? "0",
          serverVersion,
        },
      ]),
    ),
    serverExists: true,
  };
}

export async function readAuthorizationRevisionsForUserAcrossServers(
  client: AuthorizationRevisionClient,
  serverIds: string[],
  userId: string,
) {
  const uniqueServerIds = Array.from(new Set(serverIds.filter(Boolean)));
  if (uniqueServerIds.length === 0) {
    return new Map<string, AuthorizationRevision>();
  }
  const servers = await client.server.findMany({
    where: { id: { in: uniqueServerIds } },
    select: {
      authorizationRevision: true,
      authorizationSubjectRevisions: {
        where: { userId },
        select: { revision: true, userId: true },
      },
      id: true,
    },
  });
  return new Map<string, AuthorizationRevision>(
    servers.map((server) => [
      server.id,
      {
        memberVersion: (server.authorizationSubjectRevisions[0]?.revision ?? 0n).toString(),
        serverVersion: server.authorizationRevision.toString(),
      },
    ]),
  );
}
import type { Prisma } from "@wizards/db";
