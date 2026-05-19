import type { ShellReadinessPhase } from "@/lib/app-startup/readiness";

let shellStartupSplashSeen = false;

export function getInitialShellSplashPhase(): ShellReadinessPhase {
  return shellStartupSplashSeen ? "dismissed" : "showing";
}

export function markShellStartupSplashSeen() {
  shellStartupSplashSeen = true;
}

export function hasSeenShellStartupSplash() {
  return shellStartupSplashSeen;
}

export function resetShellStartupSplashSeenForTests() {
  shellStartupSplashSeen = false;
}
