import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import type { MobileDeepLinkParseResult } from "../../deep-link/mobile-deep-links";
import { resolveMobileRoutePathIntent } from "../../navigation/mobile-linking";
import { navigateMobileRouteIntent } from "../../navigation/mobile-navigation-ref";
import type { MobileNavigationCommandIntent } from "../../navigation/mobile-navigation-types";
import { useMobileDMCallStore } from "../../state/mobile-dm-call-store";
import { useMobilePerformanceAutomation } from "./mobile-performance-automation-provider";

interface MobileDeepLinkRuntime {
  readonly handleCommand: (command: MobileNavigationCommandIntent) => void;
  readonly lastDeepLink: MobileDeepLinkParseResult | null;
}

const MobileDeepLinkRuntimeContext = createContext<MobileDeepLinkRuntime | null>(null);

export function MobileDeepLinkProvider({ children }: PropsWithChildren) {
  const { completeAuthHandoff } = useMobileAuth();
  const performanceAutomation = useMobilePerformanceAutomation();
  const [lastDeepLink, setLastDeepLink] = useState<MobileDeepLinkParseResult | null>(null);

  const navigatePath = useCallback((path: string) => {
    const routeIntent = resolveMobileRoutePathIntent(path);
    if (routeIntent) {
      navigateMobileRouteIntent(routeIntent);
    }
  }, []);

  const handleCommand = useCallback(
    (command: MobileNavigationCommandIntent) => {
      setLastDeepLink({ intent: command, ok: true });

      if (command.type === "performance-automation") {
        performanceAutomation.handleCommand(command);
        return;
      }

      if (command.type === "invite") {
        navigatePath("/channels");
        return;
      }

      if (command.type === "dm-call-answer") {
        navigatePath(`/channels/@me/${command.conversationId}`);

        // Only a live inbound ring can be answered. After a cold start the socket
        // signal is gone, so the tap just opens the conversation.
        const { answerCall, session } = useMobileDMCallStore.getState();
        if (
          answerCall &&
          session?.status === "ringing-in" &&
          session.conversationId === command.conversationId
        ) {
          void answerCall().catch(() => undefined);
        }
        return;
      }

      void completeAuthHandoff({
        callbackPath: command.callbackPath,
        handoffToken: command.token,
      }).then((completed) => {
        navigatePath(completed ? command.callbackPath : "/settings");
      });
    },
    [completeAuthHandoff, navigatePath, performanceAutomation],
  );

  const value = useMemo(() => ({ handleCommand, lastDeepLink }), [handleCommand, lastDeepLink]);

  return (
    <MobileDeepLinkRuntimeContext.Provider value={value}>
      {children}
    </MobileDeepLinkRuntimeContext.Provider>
  );
}

export function useMobileDeepLinkRuntime(): MobileDeepLinkRuntime {
  const runtime = useContext(MobileDeepLinkRuntimeContext);
  if (!runtime) {
    throw new Error("Mobile deep-link provider is missing.");
  }

  return runtime;
}
