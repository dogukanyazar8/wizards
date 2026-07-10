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

interface MobileDeepLinkRuntime {
  readonly handleCommand: (command: MobileNavigationCommandIntent) => void;
  readonly lastDeepLink: MobileDeepLinkParseResult | null;
}

const MobileDeepLinkRuntimeContext = createContext<MobileDeepLinkRuntime | null>(null);

export function MobileDeepLinkProvider({ children }: PropsWithChildren) {
  const { completeAuthHandoff } = useMobileAuth();
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

      if (command.type === "invite") {
        navigatePath("/channels");
        return;
      }

      void completeAuthHandoff({
        callbackPath: command.callbackPath,
        handoffToken: command.token,
      }).then((completed) => {
        navigatePath(completed ? command.callbackPath : "/settings");
      });
    },
    [completeAuthHandoff, navigatePath],
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
