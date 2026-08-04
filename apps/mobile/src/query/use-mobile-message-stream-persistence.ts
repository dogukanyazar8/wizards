import { useEffect, useState } from "react";
import {
  MobileChannelMessagesResponseSchema,
  MobileDMMessagesResponseSchema,
} from "@wizards/types";
import type { QueryClient } from "@tanstack/react-query";
import type { MobileMessageStore, MobileMessageStoreScope } from "../storage/mobile-message-store";
import { mobileMessageStore } from "../storage/mobile-message-store-database";
import {
  dropMobileMessageStream,
  hydrateMobileMessageStream,
  isMobileMessageStreamRevoked,
  persistMobileMessageStream,
  trimMobileMessageStream,
} from "./mobile-message-stream-cache";

type MobileMessageStreamData = {
  readonly pageParams: readonly unknown[];
  readonly pages: readonly unknown[];
};

/**
 * A socket-driven stream moves on every event. Writing the whole newest page each
 * time meant a burst of messages rewrote the same 30-message JSON once per tick,
 * on the JS thread; the trailing write is the only one that mattered.
 */
const MOBILE_MESSAGE_STORE_WRITE_DEBOUNCE_MS = 1_500;

function parseStoredPage(scope: MobileMessageStoreScope, page: unknown): unknown | null {
  const schema =
    scope === "channel" ? MobileChannelMessagesResponseSchema : MobileDMMessagesResponseSchema;
  const parsed = schema.safeParse(page);
  return parsed.success ? parsed.data : null;
}

/**
 * Attempts the encrypted restore before allowing a cold stream query to start.
 * The restored page is backdated, so the enabled query immediately reconciles
 * it with the server without letting a fast network response erase disk proof.
 */
export function useMobileMessageStreamHydration(input: {
  readonly enabled: boolean;
  readonly queryClient: QueryClient;
  readonly scope: MobileMessageStoreScope;
  readonly store?: MobileMessageStore;
  readonly targetId: string | null;
  readonly userId: string | null;
}): boolean {
  const store = input.store ?? mobileMessageStore;
  const targetId = input.targetId ?? "";
  const userId = input.userId ?? "";
  const hydrationKey =
    input.enabled && targetId.length > 0 && userId.length > 0
      ? `${userId}:${input.scope}:${targetId}`
      : null;
  const [settledKey, setSettledKey] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrationKey) {
      return;
    }

    let active = true;
    void hydrateMobileMessageStream({
      parsePage: (page) => parseStoredPage(input.scope, page),
      queryClient: input.queryClient,
      scope: input.scope,
      store,
      targetId,
      userId,
    })
      .catch(() => null)
      .finally(() => {
        if (active) {
          setSettledKey(hydrationKey);
        }
      });

    return () => {
      active = false;
    };
  }, [hydrationKey, input.queryClient, input.scope, store, targetId, userId]);

  return !input.enabled || (hydrationKey !== null && settledKey === hydrationKey);
}

/**
 * Binds one open message stream to the encrypted cache: seed it on open, store
 * its newest page whenever it moves, and take it away when the server says the
 * reader may no longer have it.
 *
 * The hydration effect runs before the fetch resolves, which is the whole point —
 * the reader sees the conversation they left instead of a skeleton. It never wins
 * against live data: `hydrateMobileMessageStream` only seeds an empty stream.
 */
export function useMobileMessageStreamPersistence(input: {
  readonly data: MobileMessageStreamData | undefined;
  readonly enabled: boolean;
  /** Set false when a route already owns the pre-query hydration barrier. */
  readonly hydrateOnMount?: boolean;
  /** The stream query's failure, so a revoked conversation can be dropped. */
  readonly error?: unknown;
  readonly queryClient: QueryClient;
  readonly scope: MobileMessageStoreScope;
  readonly store?: MobileMessageStore;
  readonly targetId: string | null;
  readonly userId: string | null;
}): void {
  const { data, enabled, error, queryClient, scope } = input;
  const store = input.store ?? mobileMessageStore;
  const targetId = input.targetId ?? "";
  const userId = input.userId ?? "";

  useEffect(() => {
    if (
      input.hydrateOnMount === false ||
      !enabled ||
      targetId.length === 0 ||
      userId.length === 0
    ) {
      return;
    }

    void hydrateMobileMessageStream({
      parsePage: (page) => parseStoredPage(scope, page),
      queryClient,
      scope,
      store,
      targetId,
      userId,
    }).catch(() => null);
  }, [enabled, input.hydrateOnMount, queryClient, scope, store, targetId, userId]);

  // Reconciliation has to be able to remove. A restored page is stale by
  // definition, and the reader's access to the conversation can have been
  // revoked in the meantime — leaving it on screen because the refetch failed
  // is the one failure mode a stale-first cache must not have.
  const isRevoked = isMobileMessageStreamRevoked(error);
  useEffect(() => {
    if (!isRevoked || targetId.length === 0 || userId.length === 0) {
      return;
    }

    void dropMobileMessageStream({ queryClient, scope, store, targetId, userId }).catch(
      () => undefined,
    );
  }, [isRevoked, queryClient, scope, store, targetId, userId]);

  // Leaving a conversation gives its older pages back. The stream stays in the
  // cache — reopening it must not cost a request — but a reader who paged to the
  // start of a long conversation should not carry all of it into the next one.
  useEffect(() => {
    if (targetId.length === 0) {
      return;
    }

    return () => {
      // QueryObserver unsubscribes in a sibling cleanup. The microtask runs after
      // that lifecycle pass, so the active-stream guard can distinguish a real
      // close from a route that is still mounted or was immediately reopened.
      queueMicrotask(() => {
        trimMobileMessageStream({ queryClient, scope, targetId });
      });
    };
  }, [queryClient, scope, targetId]);

  useEffect(() => {
    if (!enabled || targetId.length === 0 || userId.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      void persistMobileMessageStream({ data, scope, store, targetId, userId }).catch(
        () => undefined,
      );
    }, MOBILE_MESSAGE_STORE_WRITE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [data, enabled, scope, store, targetId, userId]);
}
