import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";

const DESKTOP_SESSION_ENDPOINT = "/api/auth/session";
export const DESKTOP_SESSION_RESOLVE_TIMEOUT_MS = 4_000;

export interface DesktopStartResolution {
  authenticated: boolean;
  destination: string;
}

type DesktopSessionFetch = typeof fetch;

function getLoginDestination(callbackUrl: string) {
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

function hasAuthenticatedSession(payload: unknown) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    "user" in payload &&
    (payload as { user?: unknown }).user &&
    typeof (payload as { user?: unknown }).user === "object",
  );
}

export function resolveDesktopStartDestinationFromSession(
  callbackUrl: string,
  sessionPayload: unknown,
): DesktopStartResolution {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl);
  const authenticated = hasAuthenticatedSession(sessionPayload);

  return {
    authenticated,
    destination: authenticated ? safeCallbackUrl : getLoginDestination(safeCallbackUrl),
  };
}

export async function resolveDesktopStartDestination(
  callbackUrl: string,
  options: {
    fetcher?: DesktopSessionFetch;
    timeoutMs?: number;
  } = {},
): Promise<DesktopStartResolution> {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DESKTOP_SESSION_RESOLVE_TIMEOUT_MS;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    controller && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const requestInit: RequestInit = {
      cache: "no-store",
      credentials: "same-origin",
    };
    if (controller) {
      requestInit.signal = controller.signal;
    }

    const response = await fetcher(DESKTOP_SESSION_ENDPOINT, requestInit);

    if (!response.ok) {
      return {
        authenticated: false,
        destination: getLoginDestination(safeCallbackUrl),
      };
    }

    return resolveDesktopStartDestinationFromSession(safeCallbackUrl, await response.json());
  } catch {
    return {
      authenticated: false,
      destination: getLoginDestination(safeCallbackUrl),
    };
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}
