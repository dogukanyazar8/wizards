import { useEffect } from "react";
import {
  MobileChannelMessagesResponseSchema,
  MobileDMMessagesResponseSchema,
} from "@wizards/types";
import type { QueryClient } from "@tanstack/react-query";
import type { MobileMessageStore, MobileMessageStoreScope } from "../storage/mobile-message-store";
import { mobileMessageStore } from "../storage/mobile-message-store-database";
import {
  hydrateMobileMessageStream,
  persistMobileMessageStream,
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
 * Binds one open message stream to the encrypted cache: seed it on open, store
 * its newest page whenever it moves.
 *
 * The hydration effect runs before the fetch resolves, which is the whole point —
 * the reader sees the conversation they left instead of a skeleton. It never wins
 * against live data: `hydrateMobileMessageStream` only seeds an empty stream.
 */
export function useMobileMessageStreamPersistence(input: {
  readonly data: MobileMessageStreamData | undefined;
  readonly enabled: boolean;
  readonly queryClient: QueryClient;
  readonly scope: MobileMessageStoreScope;
  readonly store?: MobileMessageStore;
  readonly targetId: string | null;
  readonly userId: string | null;
}): void {
  const { data, enabled, queryClient, scope } = input;
  const store = input.store ?? mobileMessageStore;
  const targetId = input.targetId ?? "";
  const userId = input.userId ?? "";

  useEffect(() => {
    if (!enabled || targetId.length === 0 || userId.length === 0) {
      return;
    }

    void hydrateMobileMessageStream({
      parsePage: (page) => parseStoredPage(scope, page),
      queryClient,
      scope,
      store,
      targetId,
      userId,
    }).catch(() => false);
  }, [enabled, queryClient, scope, store, targetId, userId]);

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
