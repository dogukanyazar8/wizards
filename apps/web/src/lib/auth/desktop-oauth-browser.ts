// Coordination only: no credentials or handoff tokens belong in browser storage.
// Auth.js uses one set of PKCE/state cookies per origin, shared by all tabs.
export const DESKTOP_OAUTH_BROWSER_KEY = "whispr:desktop-oauth-browser";
const ATTEMPT_TTL_MS = 15 * 60 * 1000;

interface BrowserAttempt {
  id: string;
  requestId?: string | undefined;
  status: "pending" | "complete";
  expiresAt: number;
}

export function readDesktopOAuthBrowserAttempt(): BrowserAttempt | null {
  const value = localStorage.getItem(DESKTOP_OAUTH_BROWSER_KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BrowserAttempt>;
    if (
      typeof parsed.id === "string" &&
      (parsed.requestId === undefined || typeof parsed.requestId === "string") &&
      (parsed.status === "pending" || parsed.status === "complete") &&
      typeof parsed.expiresAt === "number" &&
      Number.isFinite(parsed.expiresAt) &&
      // Remember a completed request until the next sign-in replaces this one record.
      // Its old browser tabs should still open the app after the pending lease expires.
      (parsed.status === "complete" || parsed.expiresAt > Date.now())
    ) {
      return parsed as BrowserAttempt;
    }
  } catch {
    // Malformed coordination data is not an authenticated session.
  }
  return null;
}

export async function startDesktopOAuthBrowserAttempt(
  start: (attemptId: string) => Promise<unknown>,
  restart = false,
  requestId?: string,
) {
  // Fail visibly if storage/locks are unavailable; never race shared OAuth cookies.
  return navigator.locks.request(DESKTOP_OAUTH_BROWSER_KEY, async () => {
    const previous = readDesktopOAuthBrowserAttempt();
    if (!restart) {
      if (previous?.status === "pending") return "pending";
      if (requestId && previous?.requestId === requestId && previous.status === "complete") {
        return "complete";
      }
    }
    const attempt: BrowserAttempt = {
      id: crypto.randomUUID(),
      requestId,
      status: "pending",
      expiresAt: Date.now() + ATTEMPT_TTL_MS,
    };
    localStorage.setItem(DESKTOP_OAUTH_BROWSER_KEY, JSON.stringify(attempt));
    try {
      await start(attempt.id);
      return "started";
    } catch (error) {
      if (readDesktopOAuthBrowserAttempt()?.id === attempt.id) {
        localStorage.removeItem(DESKTOP_OAUTH_BROWSER_KEY);
      }
      throw error;
    }
  });
}

export function completeDesktopOAuthBrowserAttempt(attemptId: string) {
  const attempt = readDesktopOAuthBrowserAttempt();
  if (!attempt || attempt.id !== attemptId) return false;
  localStorage.setItem(
    DESKTOP_OAUTH_BROWSER_KEY,
    JSON.stringify({ ...attempt, status: "complete" }),
  );
  return true;
}
