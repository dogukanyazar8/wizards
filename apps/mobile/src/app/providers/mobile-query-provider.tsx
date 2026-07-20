import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { focusManager, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AppState } from "react-native";
import { getMobileRuntimeConfig } from "../../config/environment";
import {
  MOBILE_QUERY_CACHE_MAX_AGE_MS,
  shouldPersistMobileQuery,
} from "../../query/mobile-query-cache-policy";
import { createMobileQueryClient } from "../../query/mobile-query-client";
import { createMobileQueryPersister } from "../../query/mobile-query-persistence";

export function MobileQueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(createMobileQueryClient);
  const persistOptions = useMemo(
    () => ({
      dehydrateOptions: { shouldDehydrateQuery: shouldPersistMobileQuery },
      maxAge: MOBILE_QUERY_CACHE_MAX_AGE_MS,
      persister: createMobileQueryPersister(getMobileRuntimeConfig().environment),
    }),
    [],
  );

  useEffect(() => {
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });

    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {children}
    </PersistQueryClientProvider>
  );
}

export function useMobileQueryClient() {
  return useQueryClient();
}
