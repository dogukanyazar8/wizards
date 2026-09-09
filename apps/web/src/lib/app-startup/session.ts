import type { SplashPhase } from "@/lib/splash/splash-machine";

const SHELL_STARTUP_SPLASH_STORAGE_KEY = "whispr:shell-startup-splash-seen";

let shellStartupSplashSeen = false;

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readStoredShellStartupSplashSeen(): boolean {
  try {
    return getSessionStorage()?.getItem(SHELL_STARTUP_SPLASH_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function getInitialShellSplashPhase(): SplashPhase {
  // Keep SSR and the first hydration render identical. Persisted state is restored
  // in a layout effect before paint; reading it here would create hydration drift.
  return shellStartupSplashSeen ? "dismissed" : "showing";
}

export function markShellStartupSplashSeen() {
  shellStartupSplashSeen = true;

  try {
    getSessionStorage()?.setItem(SHELL_STARTUP_SPLASH_STORAGE_KEY, "1");
  } catch {
    // Storage can be disabled by the browser. Module state still protects SPA remounts.
  }
}

export function hasSeenShellStartupSplash() {
  return shellStartupSplashSeen || readStoredShellStartupSplashSeen();
}

/**
 * Kabuk açılış perdesinin bu oturumdaki kararı.
 *
 * İkinci parametre StrictMode içindir: React geliştirme kipinde efekti **iki kez** koşturur ve
 * ilk koşu perdeyi "görüldü" olarak işaretler. İkinci koşu aynı soruyu yeniden sorduğunda
 * `dismissed` dönerdi ve perde daha açılmadan kapanırdı. Önceki karar verildiğinde o karar
 * korunur; ilk çözüm oturumun tek çözümüdür.
 */
export function resolveShellSplashPhaseForClientSession(
  initialPhase: SplashPhase,
  previousResolution?: SplashPhase,
): SplashPhase {
  if (previousResolution !== undefined) {
    return previousResolution;
  }

  if (hasSeenShellStartupSplash()) {
    return "dismissed";
  }

  markShellStartupSplashSeen();
  return initialPhase;
}

export function resetShellStartupSplashSeenForTests() {
  shellStartupSplashSeen = false;

  try {
    getSessionStorage()?.removeItem(SHELL_STARTUP_SPLASH_STORAGE_KEY);
  } catch {
    // Test cleanup remains safe when storage access is unavailable.
  }
}
