import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildMobileConversationFilterKey,
  MOBILE_CONVERSATION_DEFAULT_FILTER,
  parseMobileConversationFilters,
  serializeMobileConversationFilters,
  setMobileConversationFilter,
  type MobileConversationFilterId,
} from "../mobile-group-chat-model";

export const MOBILE_CONVERSATION_FILTER_STORAGE_KEY = "whispr.mobile.conversation-filter";

export interface MobileConversationFilterRuntime {
  readonly filter: MobileConversationFilterId;
  setFilter(filter: MobileConversationFilterId): void;
}

/**
 * 2a §1's chip row, persisted per account under one AsyncStorage key — the same
 * shape `useMobileWorkspaceFilter` uses, minus its second axis: the inbox has one
 * chip row, not one per server.
 *
 * The version ref stops a slow disk read from clobbering a chip the reader just
 * tapped, and the ref mirror lets the setter persist the exact next map without
 * a render-phase side effect (React Compiler safe).
 *
 * The choice never reaches the server, so a signed-out caller (`userId === null`)
 * reads the default and writes nothing rather than persisting under a key it
 * cannot own.
 */
export function useMobileConversationFilter(
  userId: string | null,
): MobileConversationFilterRuntime {
  const [filters, setFilters] = useState<Record<string, MobileConversationFilterId>>({});
  const filtersRef = useRef<Record<string, MobileConversationFilterId>>({});
  const userToggleVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const versionAtStart = userToggleVersion.current;

    void AsyncStorage.getItem(MOBILE_CONVERSATION_FILTER_STORAGE_KEY)
      .then((stored) => {
        if (active && userToggleVersion.current === versionAtStart) {
          const parsed = parseMobileConversationFilters(stored);
          filtersRef.current = parsed;
          setFilters(parsed);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const filter =
    userId === null
      ? MOBILE_CONVERSATION_DEFAULT_FILTER
      : (filters[buildMobileConversationFilterKey(userId)] ?? MOBILE_CONVERSATION_DEFAULT_FILTER);

  const setFilter = useCallback(
    (next: MobileConversationFilterId) => {
      if (userId === null) {
        return;
      }

      userToggleVersion.current += 1;
      const nextFilters = setMobileConversationFilter(
        filtersRef.current,
        buildMobileConversationFilterKey(userId),
        next,
      );
      filtersRef.current = nextFilters;
      setFilters(nextFilters);
      void AsyncStorage.setItem(
        MOBILE_CONVERSATION_FILTER_STORAGE_KEY,
        serializeMobileConversationFilters(nextFilters),
      ).catch(() => undefined);
    },
    [userId],
  );

  return { filter, setFilter };
}
