import { MOBILE_ACCOUNT_APPEARANCE_DEFAULT, type MobileAccountAppearance } from "@wizards/types";

/**
 * Cross-device sync for the message-body appearance (redesign §3, M4A).
 *
 * The local write is what the reader sees, so it is never gated on the network:
 * the theme provider persists to AsyncStorage the moment the slider moves, and
 * this module is only responsible for getting the same values to the server
 * eventually. Dragging across four stops therefore produces one PATCH, not four.
 */

/** Long enough to swallow a slider drag, short enough to survive a quick app switch. */
export const MOBILE_APPEARANCE_SYNC_DEBOUNCE_MS = 800;

export function areMobileAppearancesEqual(
  first: MobileAccountAppearance,
  second: MobileAccountAppearance,
): boolean {
  return (
    first.messageCompact === second.messageCompact &&
    first.messageFollowSystemFont === second.messageFollowSystemFont &&
    first.messageFontSize === second.messageFontSize
  );
}

export interface MobileAppearanceSyncQueue {
  /** Drops the pending write without sending it. */
  cancel(): void;
  /** Sends whatever is pending right now; resolves once the write settles. */
  flush(): Promise<void>;
  /** Schedules `appearance` to be written, replacing any pending value. */
  queue(appearance: MobileAccountAppearance): void;
}

export interface MobileAppearanceSyncQueueOptions {
  readonly delayMs?: number;
  /** Injected so the queue is testable without an API client. */
  readonly write: (appearance: MobileAccountAppearance) => Promise<unknown>;
}

export function createMobileAppearanceSyncQueue(
  options: MobileAppearanceSyncQueueOptions,
): MobileAppearanceSyncQueue {
  const delayMs = options.delayMs ?? MOBILE_APPEARANCE_SYNC_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: MobileAccountAppearance | null = null;
  /** Last value the server accepted; a repeat of it is not worth a request. */
  let lastWritten: MobileAccountAppearance | null = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function send(): Promise<void> {
    const appearance = pending;
    pending = null;
    if (!appearance || (lastWritten && areMobileAppearancesEqual(appearance, lastWritten))) {
      return;
    }

    // A failed sync is not worth surfacing: the value is already applied and
    // stored locally, and the next change retries the whole payload anyway.
    try {
      await options.write(appearance);
      lastWritten = appearance;
    } catch {
      // Intentionally swallowed; see above.
    }
  }

  return {
    cancel() {
      clearTimer();
      pending = null;
    },
    async flush() {
      clearTimer();
      await send();
    },
    queue(appearance) {
      pending = appearance;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void send();
      }, delayMs);
    },
  };
}

export interface MobileAppearanceHydrationInput {
  /** True once the local AsyncStorage preferences have finished loading. */
  readonly localReady: boolean;
  readonly local: MobileAccountAppearance;
  readonly hasHydrated: boolean;
  readonly remote: MobileAccountAppearance | undefined;
}

export type MobileAppearanceHydrationResult =
  | { readonly type: "adopt-remote"; readonly appearance: MobileAccountAppearance }
  | { readonly type: "push-local"; readonly appearance: MobileAccountAppearance }
  | { readonly type: "idle" };

/**
 * What the first server payload after sign-in means for the local preference.
 * Reconciliation runs once per session: afterwards the local value wins and
 * flows outward, so a slow settings refetch can never stomp a size the reader
 * just picked.
 *
 * The tie-break on that first payload is whether the device holds an opinion:
 *
 * - device still on the shipped defaults -> adopt the server's value. This is
 *   what makes "the size I set on my phone" show up on a fresh install.
 * - device carries a non-default value the server does not have -> upload it,
 *   rather than silently resetting a choice the reader can see on screen.
 *
 * Two devices that each set a different size before either synced is genuinely
 * ambiguous without per-field timestamps; this resolves it toward whatever the
 * person in front of the device is currently looking at.
 */
export function resolveMobileAppearanceHydration(
  input: MobileAppearanceHydrationInput,
): MobileAppearanceHydrationResult {
  if (!input.localReady || !input.remote || input.hasHydrated) {
    return { type: "idle" };
  }

  if (areMobileAppearancesEqual(input.local, input.remote)) {
    return { type: "idle" };
  }

  if (areMobileAppearancesEqual(input.local, MOBILE_ACCOUNT_APPEARANCE_DEFAULT)) {
    return { appearance: input.remote, type: "adopt-remote" };
  }

  return { appearance: input.local, type: "push-local" };
}
