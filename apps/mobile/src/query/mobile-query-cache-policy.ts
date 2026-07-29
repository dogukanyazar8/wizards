import type { MobileEnvironmentName } from "../config/environment";

/**
 * Roots that survive a restart, as an allowlist on purpose. AsyncStorage is not
 * encrypted, so a query added later stays memory-only until someone opts it in
 * here — message bodies can never reach disk by forgetting a denylist entry.
 */
const PERSISTED_QUERY_ROOTS = new Set([
  "bootstrap",
  "dm-conversations",
  "friends",
  "profile",
  "workspace",
]);

export const MOBILE_QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * How long a *persisted* query stays in memory: matching the disk max-age, because
 * a payload that outlives the process is worthless if the in-memory cache drops it
 * minutes later.
 */
export const MOBILE_PERSISTED_QUERY_GC_TIME_MS = MOBILE_QUERY_CACHE_MAX_AGE_MS;

/**
 * How long everything else stays. Memory-only payloads have no reason to survive
 * the reader leaving the screen for half an hour, and a day of them is RSS the
 * device could have spent on the list they are looking at.
 */
export const MOBILE_MEMORY_QUERY_GC_TIME_MS = 30 * 60_000;
export const MOBILE_QUERY_CACHE_THROTTLE_MS = 2_000;

/**
 * Bump when a persisted payload shape changes incompatibly. Restores that carry
 * an older suffix are simply never read, so no migration code is needed.
 */
export const MOBILE_QUERY_CACHE_SCHEMA_VERSION = 1;

export function getMobileQueryCacheKey(environment: MobileEnvironmentName): string {
  return `whispr.mobile.query-cache.${environment}.v${MOBILE_QUERY_CACHE_SCHEMA_VERSION}`;
}

export type MobilePersistableQuery = {
  readonly queryKey: readonly unknown[];
  readonly state: { readonly status: string };
};

export type MobilePersistedClientState = {
  readonly clientState: {
    readonly queries: readonly {
      readonly queryKey: readonly unknown[];
      readonly state: { readonly data?: unknown };
    }[];
  };
};

export function shouldPersistMobileQuery(query: MobilePersistableQuery): boolean {
  if (query.state.status !== "success") {
    return false;
  }

  const [namespace, root] = query.queryKey;
  return namespace === "mobile" && typeof root === "string" && PERSISTED_QUERY_ROOTS.has(root);
}

function isWorkspaceDetailKey(queryKey: readonly unknown[]): boolean {
  return queryKey.length === 3 && queryKey[0] === "mobile" && queryKey[1] === "workspace";
}

function isDMConversationsKey(queryKey: readonly unknown[]): boolean {
  return queryKey.length === 2 && queryKey[0] === "mobile" && queryKey[1] === "dm-conversations";
}

function stripChannelPreviews(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((channel) =>
    channel && typeof channel === "object" && "lastMessage" in channel
      ? { ...(channel as Record<string, unknown>), lastMessage: null }
      : channel,
  );
}

function stripDetailPreviews(data: unknown): unknown {
  if (!data || typeof data !== "object" || !("detail" in data)) {
    return data;
  }

  const detail = (data as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") {
    return data;
  }

  const record = detail as Record<string, unknown>;
  const categories = Array.isArray(record.categories)
    ? record.categories.map((category) =>
        category && typeof category === "object"
          ? {
              ...(category as Record<string, unknown>),
              channels: stripChannelPreviews((category as Record<string, unknown>).channels),
            }
          : category,
      )
    : record.categories;

  return {
    ...(data as Record<string, unknown>),
    detail: {
      ...record,
      categories,
      ungroupedChannels: stripChannelPreviews(record.ungroupedChannels),
    },
  };
}

function stripDMConversationPreviews(data: unknown): unknown {
  if (!data || typeof data !== "object" || !("pages" in data)) {
    return data;
  }

  const pages = (data as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) {
    return data;
  }

  return {
    ...(data as Record<string, unknown>),
    pages: pages.map((page) => {
      if (!page || typeof page !== "object" || !("conversations" in page)) {
        return page;
      }

      const conversations = (page as { conversations?: unknown }).conversations;
      return {
        ...(page as Record<string, unknown>),
        conversations: Array.isArray(conversations)
          ? conversations.map((conversation) =>
              conversation && typeof conversation === "object" && "lastMessage" in conversation
                ? { ...(conversation as Record<string, unknown>), lastMessage: null }
                : conversation,
            )
          : conversations,
      };
    }),
  };
}

/**
 * AsyncStorage is not encrypted, so nothing that reaches it may carry message
 * content. Two persisted payloads do:
 *
 * - workspace detail, one preview line per channel;
 * - the DM inbox, one preview per conversation — text, author and delivery
 *   status.
 *
 * Both previews are dropped on the way to disk. The lists restore instantly with
 * their names, unread counts and ordering intact, and the preview line fills in
 * on the first refetch. Message bodies themselves live only in the encrypted
 * store (see `storage/mobile-message-store.ts`).
 */
export function stripMobilePersistedMessagePreviews<T extends MobilePersistedClientState>(
  client: T,
): T {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((query) => {
        if (isWorkspaceDetailKey(query.queryKey)) {
          return {
            ...query,
            state: { ...query.state, data: stripDetailPreviews(query.state.data) },
          };
        }
        if (isDMConversationsKey(query.queryKey)) {
          return {
            ...query,
            state: { ...query.state, data: stripDMConversationPreviews(query.state.data) },
          };
        }
        return query;
      }),
    },
  };
}
