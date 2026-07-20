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

/**
 * Workspace detail carries a one-line preview of each channel's newest message.
 * That is message content, so it is dropped on the way to disk; the channel list
 * restores instantly and the preview line fills in on the first refetch.
 */
export function stripMobilePersistedMessagePreviews<T extends MobilePersistedClientState>(
  client: T,
): T {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((query) =>
        isWorkspaceDetailKey(query.queryKey)
          ? { ...query, state: { ...query.state, data: stripDetailPreviews(query.state.data) } }
          : query,
      ),
    },
  };
}
