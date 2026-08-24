import type { PrismaClient } from "@wizards/db";

import { ApiError } from "@/lib/api";
import type {
  HomePresenceReader,
  HomePresenceStateReader,
  VisibleChannelResolver,
} from "@/lib/home/service";
import type { HomePresence } from "@/lib/home/types";

/**
 * Test doubles for the home endpoints. Not a production module: nothing under
 * `src` imports it outside `*.test.ts`.
 *
 * The point of the fake database is the **query budget**. Every call is recorded
 * with its model and operation, so a test can assert both "this endpoint costs
 * exactly N queries" and "N does not move when `limit` does".
 */

export type RecordedQuery = {
  readonly args: unknown;
  readonly operation: string;
};

export type FakeModelHandlers = Record<string, (args: unknown) => unknown>;

export type FakeDatabaseConfig = {
  /** Sequential answers for `$queryRaw`, in call order. */
  readonly queryRaw?: readonly unknown[];
  readonly models?: Record<string, FakeModelHandlers>;
};

export type FakeDatabase = {
  readonly calls: RecordedQuery[];
  readonly database: PrismaClient;
  /** How many database round trips the endpoint made. */
  readonly queryCount: () => number;
};

const MODEL_NAMES = [
  "channel",
  "channelReadState",
  "dMConversation",
  "dMMessage",
  "dMMessageMention",
  "dMParticipant",
  "friendRequest",
  // Bahsedilmeler Ş3: akışın triyaj tablosu, thread takibi ve bağlam panelinin okuduğu
  // mesaj tabloları. Listedeki her ad bir Proxy alıyor; eksik bir ad `undefined` olur ve
  // testi "bu model yok" diye değil, "bu satır tanımsız" diye kırar.
  "mentionState",
  "message",
  "messageMention",
  "notification",
  "role",
  "scheduledEvent",
  "scheduledEventInterest",
  "server",
  "serverMember",
  "threadFollow",
  "user",
  "voiceState",
] as const;

export function createFakeDatabase(config: FakeDatabaseConfig = {}): FakeDatabase {
  const calls: RecordedQuery[] = [];
  const rawAnswers = [...(config.queryRaw ?? [])];
  let rawIndex = 0;

  const database: Record<string, unknown> = {
    $queryRaw: (args: unknown) => {
      calls.push({ args, operation: "$queryRaw" });
      const answer = rawAnswers[rawIndex] ?? [];
      rawIndex += 1;
      return Promise.resolve(answer);
    },
  };

  for (const model of MODEL_NAMES) {
    const handlers = config.models?.[model] ?? {};
    database[model] = new Proxy(
      {},
      {
        get: (_target, operation: string) => (args: unknown) => {
          calls.push({ args, operation: `${model}.${operation}` });
          const handler = handlers[operation];
          return Promise.resolve(handler ? handler(args) : []);
        },
      },
    );
  }

  return {
    calls,
    database: database as unknown as PrismaClient,
    queryCount: () => calls.length,
  };
}

/** Presence reader that answers from a fixed table, like a redacted read would. */
export function fakePresenceReader(
  presenceByUserId: Readonly<Record<string, HomePresence>> = {},
): HomePresenceReader {
  return (_viewerId, subjectIds) =>
    Promise.resolve(
      new Map(subjectIds.map((userId) => [userId, presenceByUserId[userId] ?? "OFFLINE"])),
    );
}

/**
 * The same table plus the hidden set — what the live rooms card reads. `hidden`
 * is the answer the redaction would give, so an authorization test shrinks the
 * set rather than editing the payload afterwards.
 */
export function fakePresenceStateReader(
  presenceByUserId: Readonly<Record<string, HomePresence>> = {},
  hidden: readonly string[] = [],
): HomePresenceStateReader {
  const hiddenUserIds = new Set(hidden);

  return (_viewerId, subjectIds) =>
    Promise.resolve({
      hiddenUserIds,
      presenceByUserId: new Map(
        subjectIds.map((userId) => [userId, presenceByUserId[userId] ?? "OFFLINE"]),
      ),
    });
}

/**
 * Stands in for the permission service. `visibleByServer` is the *answer* the
 * real resolver would give — an authorization test drives the endpoint by
 * shrinking it, never by editing the payload afterwards.
 */
export function fakeChannelResolver(
  visibleByServer: Readonly<Record<string, readonly string[]>> = {},
): VisibleChannelResolver {
  return (_userId, serverIds) =>
    Promise.resolve(
      new Map(serverIds.map((serverId) => [serverId, visibleByServer[serverId] ?? []])),
    );
}

export const UNAUTHENTICATED = () => Promise.reject(new ApiError("Unauthorized", 401));

export function recordRateLimit(recorded: string[]) {
  return (_userId: string, action: string) => {
    recorded.push(action);
    return Promise.resolve();
  };
}

/** The raw SQL text of a recorded `$queryRaw` call, unescaped for assertions. */
export function sqlText(args: unknown): string {
  return JSON.stringify(args ?? {}).replaceAll('\\"', '"');
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json();
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}
