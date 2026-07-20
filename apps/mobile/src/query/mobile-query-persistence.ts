import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";
import type { MobileEnvironmentName } from "../config/environment";
import {
  MOBILE_QUERY_CACHE_THROTTLE_MS,
  getMobileQueryCacheKey,
  stripMobilePersistedMessagePreviews,
} from "./mobile-query-cache-policy";

export function createMobileQueryPersister(environment: MobileEnvironmentName): Persister {
  return createAsyncStoragePersister({
    key: getMobileQueryCacheKey(environment),
    serialize: (client) => JSON.stringify(stripMobilePersistedMessagePreviews(client)),
    storage: AsyncStorage,
    throttleTime: MOBILE_QUERY_CACHE_THROTTLE_MS,
  });
}

export async function purgeMobileQueryCache(environment: MobileEnvironmentName): Promise<void> {
  try {
    await AsyncStorage.removeItem(getMobileQueryCacheKey(environment));
  } catch {
    // Sign-out must complete even when storage is unavailable. The cache is
    // already cleared in memory by the caller and is bounded by maxAge on disk.
  }
}
