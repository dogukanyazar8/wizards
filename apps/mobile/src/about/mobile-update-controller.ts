import { getMobileNetworkClassSnapshot } from "../network/mobile-network-events";

export type MobileUpdateStep = "download" | "verify" | "install";

/**
 * `disabled` is not a server state — it is what this build reports when
 * `Updates.isEnabled` is false, which is every build so far because
 * `app.config.js` carries no `updates` key. The other members mirror
 * `MobileAppUpdateState` in `@wizards/types`.
 */
export type MobileUpdateState =
  "available" | "checking" | "current" | "disabled" | "downloading" | "failed" | "ready";

export type MobileUpdateErrorKind =
  "check-failed" | "disabled" | "download-failed" | "install-failed" | "verify-failed";

export interface MobileUpdateProgress {
  readonly step: MobileUpdateStep;
  /** null = ilerleme ölçülemiyor (expo-updates yüzde vermiyor) */
  readonly percent: number | null;
  readonly downloadedBytes: number | null;
  readonly totalBytes: number | null;
  readonly etaSeconds: number | null;
  readonly network: "wifi" | "cellular" | "unknown";
}

export interface MobileUpdateSnapshot {
  readonly checkedAt: string | null;
  readonly error: MobileUpdateErrorKind | null;
  readonly latestVersion: string | null;
  readonly progress: MobileUpdateProgress | null;
  readonly rollbackToEmbedded?: boolean;
  readonly state: MobileUpdateState;
}

export interface MobileUpdateController {
  readonly capabilities: {
    readonly canPause: boolean; // expo-updates: false
    readonly reportsPercent: boolean; // expo-updates: false
    readonly isEnabled: boolean; // Updates.isEnabled
  };
  cancelCheck(): void;
  check(): Promise<MobileUpdateState>;
  download(): Promise<void>;
  install(): Promise<void>;
  /** Present only on adapters whose `canPause` capability is true. */
  pause?(): Promise<void>;
  /** Present only on adapters whose `canPause` capability is true. */
  resume?(): Promise<void>;
  subscribe(listener: (snapshot: MobileUpdateSnapshot) => void): () => void;
  getSnapshot(): MobileUpdateSnapshot;
}

/**
 * §4.3: "Denetle" holds the `checking` row for at least 800 ms. An instant
 * return reads as "nothing happened" — the row flickers back to the state it
 * was already in and the tap looks ignored.
 */
export const MOBILE_UPDATE_CHECKING_FLOOR_MS = 800;

const IDLE_SNAPSHOT: MobileUpdateSnapshot = Object.freeze({
  checkedAt: null,
  error: null,
  latestVersion: null,
  progress: null,
  state: "current",
});

export interface MobileUpdateControllerDependencies {
  readonly checkForUpdateAsync: () => Promise<{
    readonly isAvailable: boolean;
    readonly isRollBackToEmbedded?: boolean;
  }>;
  readonly fetchUpdateAsync: () => Promise<{ readonly isNew: boolean }>;
  readonly getNetwork: () => MobileUpdateProgress["network"];
  readonly isEnabled: boolean;
  readonly now: () => number;
  readonly reloadAsync: () => Promise<void>;
  readonly sleep: (durationMs: number) => Promise<void>;
}

function resolveExpoNetwork(): MobileUpdateProgress["network"] {
  const networkClass = getMobileNetworkClassSnapshot();
  return networkClass === "wifi" || networkClass === "cellular" ? networkClass : "unknown";
}

/**
 * Resolved on use rather than imported at the top, the same way
 * `expo-mobile-haptics` reaches its native module: a static import would drag
 * `react-native` into `scripts/mobile-update-controller.test.ts`, which runs on
 * bare node and cannot transform it. A build without the module resolvable is
 * treated as OTA-off, which is exactly what it is.
 */
function getExpoUpdatesModule(): typeof import("expo-updates") | null {
  try {
    return require("expo-updates") as typeof import("expo-updates");
  } catch {
    return null;
  }
}

const expoDependencies: MobileUpdateControllerDependencies = {
  checkForUpdateAsync: async () => {
    const result = await getExpoUpdatesModule()?.checkForUpdateAsync();
    return {
      isAvailable: result?.isAvailable === true,
      isRollBackToEmbedded: result?.isRollBackToEmbedded === true,
    };
  },
  fetchUpdateAsync: async () => {
    const result = await getExpoUpdatesModule()?.fetchUpdateAsync();
    return { isNew: result?.isNew === true };
  },
  getNetwork: resolveExpoNetwork,
  // Resolved per construction by `readExpoUpdatesEnabled`, never spread from
  // here: spreading would evaluate it even when the caller overrode it.
  isEnabled: false,
  now: () => Date.now(),
  reloadAsync: async () => {
    await getExpoUpdatesModule()?.reloadAsync();
  },
  sleep: (durationMs) =>
    new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    }),
};

/**
 * The one controller product code uses.
 *
 * expo-updates exposes neither a pause nor a byte counter, so `canPause` and
 * `reportsPercent` are false and every progress snapshot carries `percent:
 * null`. 1d renders an indeterminate bar for that case rather than a number
 * this module made up — a fake percentage that jumps to 100% is worse than no
 * percentage at all.
 */
function readExpoUpdatesEnabled(): boolean {
  return getExpoUpdatesModule()?.isEnabled === true;
}

export function createExpoUpdateController(
  overrides: Partial<MobileUpdateControllerDependencies> = {},
): MobileUpdateController {
  const deps: MobileUpdateControllerDependencies = {
    checkForUpdateAsync: overrides.checkForUpdateAsync ?? expoDependencies.checkForUpdateAsync,
    fetchUpdateAsync: overrides.fetchUpdateAsync ?? expoDependencies.fetchUpdateAsync,
    getNetwork: overrides.getNetwork ?? expoDependencies.getNetwork,
    isEnabled: overrides.isEnabled ?? readExpoUpdatesEnabled(),
    now: overrides.now ?? expoDependencies.now,
    reloadAsync: overrides.reloadAsync ?? expoDependencies.reloadAsync,
    sleep: overrides.sleep ?? expoDependencies.sleep,
  };
  const listeners = new Set<(snapshot: MobileUpdateSnapshot) => void>();
  let snapshot: MobileUpdateSnapshot = IDLE_SNAPSHOT;
  let checkGeneration = 0;

  const emit = (next: Partial<MobileUpdateSnapshot>): MobileUpdateSnapshot => {
    snapshot = { ...snapshot, ...next };
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
    return snapshot;
  };

  const progressFor = (step: MobileUpdateStep): MobileUpdateProgress => ({
    downloadedBytes: null,
    etaSeconds: null,
    network: deps.getNetwork(),
    percent: null,
    step,
    totalBytes: null,
  });

  const disable = (): MobileUpdateState => {
    emit({ error: "disabled", progress: null, state: "disabled" });
    return "disabled";
  };

  return {
    capabilities: {
      canPause: false,
      isEnabled: deps.isEnabled,
      reportsPercent: false,
    },

    cancelCheck() {
      if (snapshot.state !== "checking") {
        return;
      }

      checkGeneration += 1;
      emit({ error: null, progress: null, rollbackToEmbedded: false, state: "current" });
    },

    getSnapshot: () => snapshot,

    async check() {
      if (!deps.isEnabled) {
        return disable();
      }

      const startedAt = deps.now();
      const generation = ++checkGeneration;
      emit({ error: null, rollbackToEmbedded: false, state: "checking" });

      let isAvailable = false;
      let isRollBackToEmbedded = false;
      let failed = false;

      try {
        const result = await deps.checkForUpdateAsync();
        isAvailable = result.isAvailable;
        isRollBackToEmbedded = result.isRollBackToEmbedded === true;
      } catch {
        failed = true;
      }

      if (generation !== checkGeneration) {
        return snapshot.state;
      }

      // The floor is measured from the tap, not added to the request: a check
      // that already took a second does not wait another 800 ms.
      const elapsed = deps.now() - startedAt;
      if (elapsed < MOBILE_UPDATE_CHECKING_FLOOR_MS) {
        await deps.sleep(MOBILE_UPDATE_CHECKING_FLOOR_MS - elapsed);
      }

      if (generation !== checkGeneration) {
        return snapshot.state;
      }

      const checkedAt = new Date(deps.now()).toISOString();

      if (failed) {
        emit({
          checkedAt,
          error: "check-failed",
          rollbackToEmbedded: false,
          state: "failed",
        });
        return "failed";
      }

      const state: MobileUpdateState = isRollBackToEmbedded
        ? "ready"
        : isAvailable
          ? "available"
          : "current";
      emit({
        checkedAt,
        error: null,
        progress: null,
        rollbackToEmbedded: isRollBackToEmbedded,
        state,
      });
      return state;
    },

    async download() {
      if (!deps.isEnabled) {
        // A check can be "disabled", but a user-requested download is a failed
        // action. It remains non-throwing so the sheet can explain the reason.
        emit({ error: "disabled", progress: null, state: "failed" });
        return;
      }

      emit({
        error: null,
        progress: progressFor("download"),
        rollbackToEmbedded: false,
        state: "downloading",
      });

      try {
        await deps.fetchUpdateAsync();
      } catch {
        emit({ error: "download-failed", progress: null, state: "failed" });
        return;
      }

      // expo-updates performs any signature work inside `fetchUpdateAsync` but
      // exposes no distinct verification progress. Reporting a `verify` step
      // here would therefore be invented; 1d keeps that row pending.
      emit({ error: null, progress: null, rollbackToEmbedded: false, state: "ready" });
    },

    async install() {
      if (!deps.isEnabled) {
        disable();
        return;
      }

      emit({ error: null, progress: progressFor("install"), state: "downloading" });

      try {
        await deps.reloadAsync();
      } catch {
        emit({ error: "install-failed", progress: null, state: "failed" });
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface MobileFakeUpdateScript {
  readonly checkDurationMs?: number;
  readonly downloadFails?: boolean;
  readonly isEnabled?: boolean;
  readonly latestVersion?: string | null;
  readonly updateAvailable?: boolean;
}

/**
 * Test and local-development double. Product code never constructs this: it
 * answers from a script rather than from the device, so a screen wired to it
 * would show an update that does not exist.
 */
export function createFakeUpdateController(
  script: MobileFakeUpdateScript = {},
  overrides: Partial<MobileUpdateControllerDependencies> = {},
): MobileUpdateController {
  const checkDurationMs = script.checkDurationMs ?? 0;
  let clock = 0;

  const controller = createExpoUpdateController({
    checkForUpdateAsync: async () => {
      clock += checkDurationMs;
      return { isAvailable: script.updateAvailable === true };
    },
    fetchUpdateAsync: async () => {
      if (script.downloadFails === true) {
        throw new Error("fake download failure");
      }
      return { isNew: true };
    },
    getNetwork: () => "wifi",
    isEnabled: script.isEnabled ?? true,
    now: () => clock,
    reloadAsync: async () => undefined,
    sleep: async (durationMs) => {
      clock += durationMs;
    },
    ...overrides,
  });

  return controller;
}
