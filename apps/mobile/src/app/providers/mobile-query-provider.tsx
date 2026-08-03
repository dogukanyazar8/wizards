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
import { selectMobileResumeRefreshKeys } from "../../query/mobile-resume-refresh";
import { useMobileActiveTargetStore } from "../../state/mobile-active-target-store";
import { createMobileQueryPersister } from "../../query/mobile-query-persistence";
import { setMobileChatCacheProbe } from "../../performance/mobile-chat-route-target";
import { markMobileStartupPhase } from "../../performance/mobile-startup-phases";
import { mobileQueryKeys } from "../../query/mobile-query-keys";

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
    // The navigator opens a span for every chat it shows and needs to know
    // whether that stream was already cached. Registering the probe here keeps
    // the client out of the navigator, which several tests render without one.
    setMobileChatCacheProbe((target) => {
      const state = queryClient.getQueryState(
        target.route === "ChannelChat"
          ? mobileQueryKeys.channelMessages(target.targetId)
          : mobileQueryKeys.dmMessages(target.targetId),
      );

      return state?.data === undefined ? null : state.dataUpdatedAt;
    });

    return () => setMobileChatCacheProbe(null);
  }, [queryClient]);

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
        // Focus no longer refetches by itself (`refetchOnWindowFocus: false`), so
        // the resume names what it wants: the screen the reader came back to.
        for (const queryKey of selectMobileResumeRefreshKeys(
          useMobileActiveTargetStore.getState(),
        )) {
          void queryClient.invalidateQueries({ exact: true, queryKey });
        }
      }, plan.delayMs);
    });

    return () => {
      clearResumeTimer();
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, [queryClient]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      // Restoring the cache from disk is one of the two things that happen
      // between the first shell frame and content the reader wants; until this
      // was marked, the gap was a single unexplained number.
      onSuccess={() => markMobileStartupPhase("cache-hydrated")}
      persistOptions={persistOptions}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export function useMobileQueryClient() {
  return useQueryClient();
}
