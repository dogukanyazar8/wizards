import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildMobileWorkspaceFilterKey,
  MOBILE_WORKSPACE_DEFAULT_FILTER,
  parseMobileWorkspaceFilters,
  serializeMobileWorkspaceFilters,
  setMobileWorkspaceFilter,
  type MobileWorkspaceFilterId,
} from "../mobile-sunucular-model";

export const MOBILE_WORKSPACE_FILTER_STORAGE_KEY = "whispr.mobile.workspace-filter";

export interface MobileWorkspaceFilterRuntime {
  filter(serverId: string): MobileWorkspaceFilterId;
  setFilter(serverId: string, filter: MobileWorkspaceFilterId): void;
}

/**
 * 6a/6b filter-strip state, persisted per user and per server under one
 * AsyncStorage key. A deliberate copy of {@link useMobileCollapsedSections}: a
 * version ref stops a slow disk read from clobbering a segment the user just
 * tapped, and a ref mirror lets the setter persist the exact next map without a
 * render-phase side effect (React Compiler safe).
 *
 * The choice never leaves the device — the server keeps no filter preference —
 * so a signed-out caller (`userId === null`) reads the default and writes
 * nothing rather than persisting under a key it cannot own.
 */
export function useMobileWorkspaceFilter(userId: string | null): MobileWorkspaceFilterRuntime {
  const [filters, setFilters] = useState<Record<string, MobileWorkspaceFilterId>>({});
  const filtersRef = useRef<Record<string, MobileWorkspaceFilterId>>({});
  const userToggleVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const versionAtStart = userToggleVersion.current;

    void AsyncStorage.getItem(MOBILE_WORKSPACE_FILTER_STORAGE_KEY)
      .then((stored) => {
        if (active && userToggleVersion.current === versionAtStart) {
          const parsed = parseMobileWorkspaceFilters(stored);
          filtersRef.current = parsed;
          setFilters(parsed);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const filter = useCallback(
    (serverId: string): MobileWorkspaceFilterId => {
      if (userId === null) {
        return MOBILE_WORKSPACE_DEFAULT_FILTER;
      }

      return (
        filters[buildMobileWorkspaceFilterKey(userId, serverId)] ?? MOBILE_WORKSPACE_DEFAULT_FILTER
      );
    },
    [filters, userId],
  );

  const setFilter = useCallback(
    (serverId: string, next: MobileWorkspaceFilterId) => {
      if (userId === null) {
        return;
      }

      userToggleVersion.current += 1;
      const nextFilters = setMobileWorkspaceFilter(
        filtersRef.current,
        buildMobileWorkspaceFilterKey(userId, serverId),
        next,
      );
      filtersRef.current = nextFilters;
      setFilters(nextFilters);
      void AsyncStorage.setItem(
        MOBILE_WORKSPACE_FILTER_STORAGE_KEY,
        serializeMobileWorkspaceFilters(nextFilters),
      ).catch(() => undefined);
    },
    [userId],
  );

  return { filter, setFilter };
}
