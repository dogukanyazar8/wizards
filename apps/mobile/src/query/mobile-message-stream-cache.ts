import type { QueryClient } from "@tanstack/react-query";
import type { MobileMessageStore, MobileMessageStoreScope } from "../storage/mobile-message-store";
import { mobileQueryKeys } from "./mobile-query-keys";
import {
  forgetMobileMessageStreamOrigin,
  markMobileMessageStreamRestored,
} from "./mobile-message-stream-source";
import { trimMobileMessageStreamPages } from "./mobile-message-stream-trim";

type MobileMessageStreamData = {
  readonly pageParams: readonly unknown[];
  readonly pages: readonly unknown[];
};

const hydrationByQueryClient = new WeakMap<QueryClient, Map<string, Promise<number | null>>>();

function streamQueryKey(scope: MobileMessageStoreScope, targetId: string) {
  return scope === "channel"
    ? mobileQueryKeys.channelMessages(targetId)
    : mobileQueryKeys.dmMessages(targetId);
}

/**
 * Draws the newest stored page into an empty stream so a cold start has messages
 * before the network answers.
 *
 * Only ever seeds: a stream the session already holds is newer than anything on
 * disk — it has been patched by the socket — so hydration must not touch it. The
 * seeded page keeps `pageParams: [null]`, which is what lets the reader page back
 * from it exactly as if it had been fetched.
 *
 * Returns when the page was written, or `null` when nothing was restored.
 */
export async function hydrateMobileMessageStream(input: {
  /**
   * The stream's own response schema. A stored page is untrusted input — the file
   * survived an app version, and the version envelope only proves it was written
   * by this schema number, not that it still parses.
   */
  readonly parsePage?: (page: unknown) => unknown | null;
  readonly queryClient: QueryClient;
  readonly scope: MobileMessageStoreScope;
  readonly store: MobileMessageStore;
  readonly targetId: string;
  readonly userId: string;
}): Promise<number | null> {
  if (input.targetId.length === 0 || input.userId.length === 0) {
    return null;
  }

  const queryKey = streamQueryKey(input.scope, input.targetId);
  if (input.queryClient.getQueryData(queryKey) !== undefined) {
    return null;
  }

  let clientHydrations = hydrationByQueryClient.get(input.queryClient);
  if (!clientHydrations) {
    clientHydrations = new Map();
    hydrationByQueryClient.set(input.queryClient, clientHydrations);
  }
  const hydrationKey = JSON.stringify([input.userId, input.scope, input.targetId]);
  const pendingHydration = clientHydrations.get(hydrationKey);
  if (pendingHydration) {
    return pendingHydration;
  }

  const hydration = hydrateMobileMessageStreamOnce(input, queryKey);
  clientHydrations.set(hydrationKey, hydration);
  try {
    return await hydration;
  } finally {
    if (clientHydrations.get(hydrationKey) === hydration) {
      clientHydrations.delete(hydrationKey);
    }
  }
}

async function hydrateMobileMessageStreamOnce(
  input: Parameters<typeof hydrateMobileMessageStream>[0],
  queryKey: ReturnType<typeof streamQueryKey>,
): Promise<number | null> {
  const entry = await input.store.readPageEntry({
    scope: input.scope,
    targetId: input.targetId,
    userId: input.userId,
  });
  if (!entry) {
    return null;
  }

  const parsed = input.parsePage ? input.parsePage(entry.payload) : entry.payload;
  if (!parsed) {
    return null;
  }

  // Re-checked after the read: the network may have answered while the encrypted
  // database was being opened, and that answer wins.
  if (input.queryClient.getQueryData(queryKey) !== undefined) {
    return null;
  }

  // Dated to the write, not to now. Seeded as fresh, a page could be a day old
  // and still hold the stream for the whole stale window — so a conversation the
  // reader had lost access to would keep rendering with no refetch to remove it.
  // Backdating makes the mount refetch, which is the reconciliation.
  input.queryClient.setQueryData(
    queryKey,
    { pageParams: [null], pages: [parsed] },
    { updatedAt: entry.updatedAt },
  );
  markMobileMessageStreamRestored(input.scope, input.targetId, entry.updatedAt);
  return entry.updatedAt;
}

/**
 * Gives a conversation's older pages back once the reader has left it.
 *
 * The write carries the stream's own `dataUpdatedAt` forward. Without that, a
 * trim would date the stream to now — the query would look freshly fetched, its
 * stale window would restart, and the network reconciliation that a restored or
 * warmed page depends on would be skipped on the next open.
 */
export function trimMobileMessageStream(input: {
  readonly maxPages?: number;
  readonly queryClient: QueryClient;
  readonly scope: MobileMessageStoreScope;
  readonly targetId: string;
}): boolean {
  if (input.targetId.length === 0) {
    return false;
  }

  const queryKey = streamQueryKey(input.scope, input.targetId);
  const state = input.queryClient.getQueryState<MobileMessageStreamData>(queryKey);
  const query = input.queryClient.getQueryCache().find({ exact: true, queryKey });
  if (state?.fetchStatus === "fetching" || (query?.getObserversCount() ?? 0) > 0) {
    return false;
  }
  const current = state?.data;
  if (!current) {
    return false;
  }

  const trimmed = trimMobileMessageStreamPages(current, input.maxPages);
  if (trimmed === current) {
    return false;
  }

  input.queryClient.setQueryData(queryKey, trimmed, { updatedAt: state.dataUpdatedAt });
  return true;
}

/**
 * Statuses that mean the reader may no longer see this conversation.
 *
 * A stale local page is allowed to be old; it is not allowed to survive the
 * server saying the reader cannot have it. 401 is deliberately absent: an expired
 * token is a session problem, and the session layer already wipes the store when
 * it decides one has ended.
 */
const MOBILE_MESSAGE_STREAM_REVOKED_STATUSES = new Set([403, 404]);

export function isMobileMessageStreamRevoked(error: unknown): boolean {
  const status = (error as { readonly status?: unknown } | null)?.status;
  return typeof status === "number" && MOBILE_MESSAGE_STREAM_REVOKED_STATUSES.has(status);
}

/**
 * Removes a stream the server refused, from memory and from disk.
 *
 * Reconciliation has to be able to take content away. Without this the refetch
 * that failed with 403 left the restored page on screen, which is the one outcome
 * a stale-first cache is not allowed to produce.
 */
export async function dropMobileMessageStream(input: {
  readonly queryClient: QueryClient;
  readonly scope: MobileMessageStoreScope;
  readonly store: MobileMessageStore;
  readonly targetId: string;
  readonly userId: string;
}): Promise<void> {
  if (input.targetId.length === 0 || input.userId.length === 0) {
    return;
  }

  const queryKey = streamQueryKey(input.scope, input.targetId);
  // `removeQueries` requests cancellation but does not wait for the in-flight
  // fetch to settle. A performance purge followed immediately by a prefetch
  // could therefore race the request it had just removed and never settle.
  await input.queryClient.cancelQueries({ exact: true, queryKey });
  input.queryClient.removeQueries({ exact: true, queryKey });
  forgetMobileMessageStreamOrigin(input.scope, input.targetId);
  await input.store.deletePage({
    scope: input.scope,
    targetId: input.targetId,
    userId: input.userId,
  });
}

/**
 * Stores the newest page of a stream. Older pages are deliberately dropped: the
 * point is the first screenful, and the rest is one scroll away from the server.
 */
export async function persistMobileMessageStream(input: {
  readonly data: MobileMessageStreamData | undefined;
  readonly scope: MobileMessageStoreScope;
  readonly store: MobileMessageStore;
  readonly targetId: string;
  readonly userId: string;
}): Promise<void> {
  const newestPage = input.data?.pages[0];
  if (input.targetId.length === 0 || input.userId.length === 0 || newestPage === undefined) {
    return;
  }

  await input.store.writePage({
    payload: newestPage,
    scope: input.scope,
    targetId: input.targetId,
    userId: input.userId,
  });
}
