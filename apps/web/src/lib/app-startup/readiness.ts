export type AppStartupStatus = "session" | "workspace" | "realtime" | "ready";

export type ShellReadinessPhase = "showing" | "hiding" | "dismissed";

export type ShellReadinessRoute =
  | "dm-conversation"
  | "dm-list"
  | "other"
  | "server-channel"
  | "server-root"
  | "settings";

export type ShellReadinessInput = {
  activeServerDetailLoading: boolean;
  appearanceHydrated: boolean;
  dmConversationsLoading?: boolean;
  layoutSettingsLoaded: boolean;
  realtimeConnected: boolean;
  route: ShellReadinessRoute;
  serversLoading: boolean;
};

export const SHELL_SPLASH_MIN_VISIBLE_MS = 400;
export const SHELL_SPLASH_MAX_VISIBLE_MS = 5000;
export const SHELL_SPLASH_FADE_OUT_MS = 260;

function routeNeedsServerDetail(route: ShellReadinessRoute): boolean {
  return route === "server-channel" || route === "server-root";
}

function routeNeedsDMConversations(route: ShellReadinessRoute): boolean {
  return route === "dm-conversation" || route === "dm-list";
}

function isRouteDataLoading(input: ShellReadinessInput): boolean {
  if (routeNeedsServerDetail(input.route) && input.activeServerDetailLoading) {
    return true;
  }

  if (routeNeedsDMConversations(input.route) && input.dmConversationsLoading) {
    return true;
  }

  return false;
}

export function isShellReady(input: ShellReadinessInput): boolean {
  return (
    input.appearanceHydrated &&
    input.layoutSettingsLoaded &&
    !input.serversLoading &&
    !isRouteDataLoading(input)
  );
}

export function getShellReadinessStatus(
  input: ShellReadinessInput & { isReady?: boolean },
): AppStartupStatus {
  const isReady = input.isReady ?? isShellReady(input);

  if (!input.appearanceHydrated || !input.layoutSettingsLoaded) {
    return "session";
  }

  if (input.serversLoading || isRouteDataLoading(input)) {
    return "workspace";
  }

  if (isReady && !input.realtimeConnected) {
    return "realtime";
  }

  return "ready";
}

export function shouldMountShellSplash(phase: ShellReadinessPhase): boolean {
  return phase === "showing" || phase === "hiding";
}

export function shouldShowShellSplash(phase: ShellReadinessPhase): boolean {
  return phase === "showing";
}

export function getShellSplashPhaseAfterMaxTimeout(
  phase: ShellReadinessPhase,
): ShellReadinessPhase {
  if (phase === "showing") {
    return "hiding";
  }

  return phase;
}
