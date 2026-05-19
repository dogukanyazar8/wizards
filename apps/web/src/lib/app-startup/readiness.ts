export type AppStartupStatus = "session" | "workspace" | "realtime" | "ready";

export type ShellReadinessPhase = "pending" | "showing" | "hiding" | "dismissed";

export type ShellReadinessInput = {
  activeServerDetailLoading: boolean;
  appearanceHydrated: boolean;
  isServerRoute: boolean;
  layoutSettingsLoaded: boolean;
  realtimeConnected: boolean;
  serversLoading: boolean;
};

export const SHELL_SPLASH_DELAY_MS = 120;
export const SHELL_SPLASH_MIN_VISIBLE_MS = 400;
export const SHELL_SPLASH_MAX_VISIBLE_MS = 7000;
export const SHELL_SPLASH_FADE_OUT_MS = 260;

export function isShellReady(input: ShellReadinessInput): boolean {
  return (
    input.appearanceHydrated &&
    input.layoutSettingsLoaded &&
    !input.serversLoading &&
    (!input.isServerRoute || !input.activeServerDetailLoading)
  );
}

export function getShellReadinessStatus(
  input: ShellReadinessInput & { isReady?: boolean },
): AppStartupStatus {
  const isReady = input.isReady ?? isShellReady(input);

  if (!input.appearanceHydrated || !input.layoutSettingsLoaded) {
    return "session";
  }

  if (input.serversLoading || (input.isServerRoute && input.activeServerDetailLoading)) {
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

  if (phase === "pending") {
    return "dismissed";
  }

  return phase;
}
