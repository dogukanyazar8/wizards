import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { getMobileRuntimeConfig } from "../../config/environment";
import type { MobileDeepLinkParseResult } from "../../deep-link/mobile-deep-links";
import { useMobileDeepLinks } from "../../deep-link/use-mobile-deep-links";

interface MobileDeepLinkRuntime {
  readonly lastDeepLink: MobileDeepLinkParseResult | null;
  readonly routeRequest: {
    readonly id: number;
    readonly path: string;
  } | null;
}

const MobileDeepLinkRuntimeContext = createContext<MobileDeepLinkRuntime | null>(null);

export function MobileDeepLinkProvider({ children }: PropsWithChildren) {
  const { completeAuthHandoff } = useMobileAuth();
  const [lastDeepLink, setLastDeepLink] = useState<MobileDeepLinkParseResult | null>(null);
  const [routeRequest, setRouteRequest] = useState<MobileDeepLinkRuntime["routeRequest"]>(null);
  const routeRequestIdRef = useRef(0);
  const runtimeConfig = getMobileRuntimeConfig();

  const publishRoute = useCallback((path: string) => {
    routeRequestIdRef.current += 1;
    setRouteRequest({ id: routeRequestIdRef.current, path });
  }, []);

  const handleDeepLink = useCallback(
    (result: MobileDeepLinkParseResult) => {
      setLastDeepLink(result);

      if (!result.ok) {
        return;
      }

      if (result.intent.type === "auth-handoff") {
        const { callbackPath, token } = result.intent;
        void completeAuthHandoff({ callbackPath, handoffToken: token }).then((completed) => {
          publishRoute(completed ? callbackPath : "/settings");
        });
        return;
      }

      if (result.intent.type === "invite") {
        publishRoute("/invite");
        return;
      }

      publishRoute(result.intent.path);
    },
    [completeAuthHandoff, publishRoute],
  );

  useMobileDeepLinks({
    onDeepLink: handleDeepLink,
    runtimeConfig,
  });

  const value = useMemo(() => ({ lastDeepLink, routeRequest }), [lastDeepLink, routeRequest]);

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
