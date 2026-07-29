import type { QueryClient } from "@tanstack/react-query";
import type { MobileMessageStore, MobileMessageStoreScope } from "../storage/mobile-message-store";
import { mobileQueryKeys } from "./mobile-query-keys";

type MobileMessageStreamData = {
  readonly pageParams: readonly unknown[];
  readonly pages: readonly unknown[];
};

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
}): Promise<boolean> {
  if (input.targetId.length === 0 || input.userId.length === 0) {
    return false;
  }

  const queryKey = streamQueryKey(input.scope, input.targetId);
  if (input.queryClient.getQueryData(queryKey) !== undefined) {
    return false;
  }

  const page = await input.store.readPage({
    scope: input.scope,
    targetId: input.targetId,
    userId: input.userId,
  });
  if (!page) {
    return false;
  }

  const parsed = input.parsePage ? input.parsePage(page) : page;
  if (!parsed) {
    return false;
  }

  // Re-checked after the read: the network may have answered while the encrypted
  // database was being opened, and that answer wins.
  if (input.queryClient.getQueryData(queryKey) !== undefined) {
    return false;
  }

  input.queryClient.setQueryData(queryKey, { pageParams: [null], pages: [parsed] });
  return true;
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
