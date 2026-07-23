import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { focusManager, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AppState, type AppStateStatus } from "react-native";
import { getMobileRuntimeConfig } from "../../config/environment";
import {
  MOBILE_QUERY_CACHE_MAX_AGE_MS,
  shouldPersistMobileQuery,
} from "../../query/mobile-query-cache-policy";
import { createMobileQueryClient } from "../../query/mobile-query-client";
import { planMobileQueryFocus } from "../../query/mobile-query-focus";
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
    // Mount is not a resume: nothing is covering the app yet, so the first
    // focus value is applied straight away.
    focusManager.setFocused(planMobileQueryFocus(AppState.currentState).focused);

    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const clearResumeTimer = () => {
      if (resumeTimer !== null) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
    };

    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      // Whichever direction the app just moved, a pending resume refetch from an
      // earlier flip is stale — rapid switching must not stack refetch waves.
      clearResumeTimer();
      const plan = planMobileQueryFocus(status);

      if (plan.delayMs === 0) {
        focusManager.setFocused(plan.focused);
        return;
      }

      resumeTimer = setTimeout(() => {
        resumeTimer = null;
        focusManager.setFocused(plan.focused);
      }, plan.delayMs);
    });

    return () => {
      clearResumeTimer();
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
