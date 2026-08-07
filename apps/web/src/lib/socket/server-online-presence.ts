/**
 * `fetchSockets()` serialises every socket in a room just to count the distinct
 * users behind them. A twelve-thousand-member community server makes that
 * expensive, and a discovery list would repeat it once per server. A Redis set
 * answers the same question with one `SCARD`.
 *
 * The set is derived state, not a record of truth: if Redis loses it, sockets
 * repopulate it as they reconnect. The TTL keeps an abandoned key from
 * outliving the process that wrote it.
 */
const ONLINE_SET_TTL_SECONDS = 60 * 60 * 12;

export type ServerOnlinePresenceRedis = {
  expire: (key: string, seconds: number) => Promise<unknown>;
  sadd: (key: string, member: string) => Promise<unknown>;
  scard: (key: string) => Promise<number>;
  srem: (key: string, member: string) => Promise<unknown>;
};

export function buildServerOnlineKey(serverId: string): string {
  return `server:${serverId}:online`;
}

export async function addServerOnlineMember(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
  userId: string,
): Promise<void> {
  const key = buildServerOnlineKey(serverId);
  await redis.sadd(key, userId);
  await redis.expire(key, ONLINE_SET_TTL_SECONDS);
}

export async function removeServerOnlineMember(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
  userId: string,
): Promise<void> {
  await redis.srem(buildServerOnlineKey(serverId), userId);
}

export async function countServerOnlineMembers(
  redis: ServerOnlinePresenceRedis,
  serverId: string,
): Promise<number> {
  return redis.scard(buildServerOnlineKey(serverId));
}
