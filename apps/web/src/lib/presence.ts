import type Redis from "ioredis";

export type VisiblePresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";

export type PresenceFallback = {
  customStatus: string | null;
  status: VisiblePresenceStatus;
  userId: string;
};

export type PresenceFields = {
  customStatus: string | null;
  status: VisiblePresenceStatus;
};

type RedisPresenceStatus = VisiblePresenceStatus | "INVISIBLE";

const PRESENCE_SOCKET_PREFIX = "presence:socket-set:";
const PRESENCE_SOCKET_TTL_MS = 120_000;

const PRESENCE_STATUSES = new Set<RedisPresenceStatus>([
  "ONLINE",
  "IDLE",
  "DND",
  "OFFLINE",
  "INVISIBLE",
]);

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePresenceStatus(value: unknown): VisiblePresenceStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase() as RedisPresenceStatus;
  if (!PRESENCE_STATUSES.has(normalized)) {
    return null;
  }

  return normalized === "INVISIBLE" ? "OFFLINE" : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePresenceRecord(
  record: Record<string, unknown>,
  fallback: PresenceFields,
): PresenceFields {
  const customStatus = normalizeNullableString(record.customStatus);
  const customStatusSnake = normalizeNullableString(record.custom_status);

  return {
    customStatus:
      customStatus !== undefined
        ? customStatus
        : customStatusSnake !== undefined
          ? customStatusSnake
          : fallback.customStatus,
    status:
      normalizePresenceStatus(record.status) ??
      normalizePresenceStatus(record.presence) ??
      fallback.status,
  };
}

export function parsePresencePayload(
  rawValue: string | null,
  fallback: PresenceFields,
): PresenceFields {
  if (!rawValue) {
    return fallback;
  }

  const directStatus = normalizePresenceStatus(rawValue);
  if (directStatus) {
    return {
      ...fallback,
      status: directStatus,
    };
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isRecord(parsed)) {
      return parsePresenceRecord(parsed, fallback);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export async function readPresenceMap(
  redis: Redis,
  fallbacks: PresenceFallback[],
): Promise<Map<string, PresenceFields>> {
  const result = new Map<string, PresenceFields>();
  const uniqueFallbacks = Array.from(
    new Map(fallbacks.map((fallback) => [fallback.userId, fallback])).values(),
  );

  for (const fallback of uniqueFallbacks) {
    result.set(fallback.userId, {
      customStatus: fallback.customStatus,
      status: fallback.status,
    });
  }

  if (uniqueFallbacks.length === 0) {
    return result;
  }

  try {
    const keys = uniqueFallbacks.map((fallback) => `presence:${fallback.userId}`);
    const socketKeys = uniqueFallbacks.map(
      (fallback) => `${PRESENCE_SOCKET_PREFIX}${fallback.userId}`,
    );
    const now = Date.now();
    const presencePipeline = redis.pipeline();
    for (let index = 0; index < uniqueFallbacks.length; index += 1) {
      const key = keys[index];
      const socketKey = socketKeys[index];
      if (!key || !socketKey) {
        continue;
      }

      presencePipeline.zremrangebyscore(socketKey, "-inf", now - PRESENCE_SOCKET_TTL_MS);
      presencePipeline.zcard(socketKey);
      presencePipeline.type(key);
    }

    const presenceResults = await presencePipeline.exec();
    if (!presenceResults) {
      return result;
    }

    const valueRequests: Array<{
      fallback: PresenceFallback;
      hasActiveSocket: boolean;
      key: string;
      type: "hash" | "string";
    }> = [];

    for (const [index, fallback] of uniqueFallbacks.entries()) {
      const resultOffset = index * 3;
      const [, rawSocketCount] = presenceResults[resultOffset + 1] ?? [];
      const [, rawType] = presenceResults[resultOffset + 2] ?? [];
      const socketCount =
        typeof rawSocketCount === "number" ? rawSocketCount : Number(rawSocketCount ?? 0);
      const keyType = typeof rawType === "string" ? rawType : "";
      const key = keys[index];

      if (!fallback || !key) {
        continue;
      }

      if (keyType === "hash" || keyType === "string") {
        valueRequests.push({
          fallback,
          hasActiveSocket: socketCount > 0,
          key,
          type: keyType,
        });
      }
    }

    if (valueRequests.length === 0) {
      return result;
    }

    const valuePipeline = redis.pipeline();
    for (const request of valueRequests) {
      if (request.type === "hash") {
        valuePipeline.hgetall(request.key);
      } else {
        valuePipeline.get(request.key);
      }
    }

    const valueResults = await valuePipeline.exec();
    if (!valueResults) {
      return result;
    }

    for (const [index, [, value]] of valueResults.entries()) {
      const request = valueRequests[index];
      if (!request) {
        continue;
      }

      const fallback = {
        customStatus: request.fallback.customStatus,
        status: request.fallback.status,
      };
      const parsedPresence =
        request.type === "hash" && isRecord(value)
          ? parsePresenceRecord(value, fallback)
          : parsePresencePayload(typeof value === "string" ? value : null, fallback);

      result.set(request.fallback.userId, {
        customStatus: parsedPresence.customStatus,
        status: request.hasActiveSocket ? parsedPresence.status : "OFFLINE",
      });
    }
  } catch {
    return result;
  }

  return result;
}
