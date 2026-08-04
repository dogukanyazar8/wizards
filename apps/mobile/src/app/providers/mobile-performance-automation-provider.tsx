import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { AppState } from "react-native";

import { useMobileAuth } from "../../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../../config/environment";
import type { MobileDeepLinkIntent } from "../../deep-link/mobile-deep-links";
import {
  createMobilePerformanceAutomationExecutor,
  type MobilePerformanceAutomationCommand,
} from "../../performance/mobile-performance-automation";
import {
  buildMobilePerformanceDiagnosticsReport,
  readMobilePerformanceDiagnostics,
  resetMobilePerformanceDiagnostics,
} from "../../performance/mobile-performance-diagnostics-runtime";
import {
  createMobileEventLoopLagMonitor,
  createMobileEventLoopLagRunLifecycle,
} from "../../performance/mobile-event-loop-lag";
import { mobileQueryKeys } from "../../query/mobile-query-keys";
import {
  prefetchMobileChannelMessagesPage,
  prefetchMeasuredMobileDMMessagesPage,
} from "../../query/mobile-message-prefetch";
import { dropMobileMessageStream } from "../../query/mobile-message-stream-cache";
import { mobileMessageStore } from "../../storage/mobile-message-store-database";

type MobilePerformanceAutomationRuntime = {
  readonly handleCommand: (command: MobilePerformanceAutomationCommand) => void;
};

const MobilePerformanceAutomationContext = createContext<MobilePerformanceAutomationRuntime | null>(
  null,
);

export function MobilePerformanceAutomationProvider({ children }: PropsWithChildren) {
  const { apiClient, session } = useMobileAuth();
  const queryClient = useQueryClient();
  const environment = getMobileRuntimeConfig().environment;
  const monitorRef = useRef<ReturnType<typeof createMobileEventLoopLagMonitor> | null>(null);
  const monitorLifecycleRef = useRef<ReturnType<
    typeof createMobileEventLoopLagRunLifecycle
  > | null>(null);
  monitorRef.current ??= createMobileEventLoopLagMonitor();
  monitorLifecycleRef.current ??= createMobileEventLoopLagRunLifecycle({
    environment,
    monitor: monitorRef.current,
  });

  useEffect(() => {
    const lifecycle = monitorLifecycleRef.current!;
    lifecycle.sync(AppState.currentState);
    const subscription = AppState.addEventListener("change", (state) => {
      lifecycle.sync(state);
    });
    return () => {
      subscription.remove();
      lifecycle.end();
    };
  }, []);

  const execute = useMemo(
    () =>
      createMobilePerformanceAutomationExecutor({
        emit: (line) => console.info(line),
        environment,
        exportReport: async () => {
          monitorLifecycleRef.current!.end();
          const diagnostics = await readMobilePerformanceDiagnostics();
          const bootstrap = queryClient.getQueryData<{
            readonly app?: { readonly buildId?: string };
          }>(mobileQueryKeys.bootstrap());
          return buildMobilePerformanceDiagnosticsReport({
            backendBuildId: bootstrap?.app?.buildId ?? "unknown",
            eventLoop: monitorRef.current!.snapshot(),
            samples: diagnostics.samples,
            storage: diagnostics.storage,
          });
        },
        prefetch: async (scope, targetId) => {
          if (!session) throw new Error("signed-in session required");
          await (scope === "channel"
            ? prefetchMobileChannelMessagesPage(queryClient, apiClient, targetId)
            : prefetchMeasuredMobileDMMessagesPage(queryClient, apiClient, targetId));
        },
        purge: async (scope, targetId) => {
          if (!session) throw new Error("signed-in session required");
          await dropMobileMessageStream({
            queryClient,
            scope,
            store: mobileMessageStore,
            targetId,
            userId: session.user.id,
          });
        },
        reset: async () => {
          monitorLifecycleRef.current!.end();
          monitorRef.current!.reset();
          await resetMobilePerformanceDiagnostics();
          monitorLifecycleRef.current!.begin();
          monitorLifecycleRef.current!.sync(AppState.currentState);
        },
      }),
    [apiClient, environment, queryClient, session],
  );

  const handleCommand = useCallback(
    (command: Extract<MobileDeepLinkIntent, { readonly type: "performance-automation" }>) => {
      void execute(command);
    },
    [execute],
  );
  const value = useMemo(() => ({ handleCommand }), [handleCommand]);

  return (
    <MobilePerformanceAutomationContext.Provider value={value}>
      {children}
    </MobilePerformanceAutomationContext.Provider>
  );
}

export function useMobilePerformanceAutomation(): MobilePerformanceAutomationRuntime {
  const runtime = useContext(MobilePerformanceAutomationContext);
  if (!runtime) throw new Error("Mobile performance automation provider is missing.");
  return runtime;
}
