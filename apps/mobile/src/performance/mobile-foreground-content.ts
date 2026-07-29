type MobileInteractionHandle = { cancel(): void };

export function createMobileForegroundContentCheckpoint(input: {
  readonly isPrivacyShieldCovered?: () => boolean;
  readonly observePrivacyShieldUncovered?: (listener: () => void) => () => void;
  readonly runAfterInteractions: (callback: () => void) => MobileInteractionHandle;
  readonly signalContentVisible: () => void;
}) {
  const isPrivacyShieldCovered = input.isPrivacyShieldCovered ?? (() => false);
  const observePrivacyShieldUncovered =
    input.observePrivacyShieldUncovered ?? (() => () => undefined);
  let active = false;
  let pending: MobileInteractionHandle | null = null;
  let generation = 0;
  let interactionReady = false;
  let signaled = false;

  function signalWhenVisible(): void {
    if (!active || !interactionReady || signaled || isPrivacyShieldCovered()) {
      return;
    }
    signaled = true;
    input.signalContentVisible();
  }

  const unobserve = observePrivacyShieldUncovered(signalWhenVisible);

  function cancelPending(): void {
    generation += 1;
    pending?.cancel();
    pending = null;
  }

  return {
    dispose() {
      cancelPending();
      unobserve();
    },
    observeAppState(state: string) {
      if (state !== "active") {
        active = false;
        interactionReady = false;
        signaled = false;
        cancelPending();
        return;
      }
      active = true;
      interactionReady = false;
      signaled = false;
      cancelPending();
      const scheduledGeneration = generation;
      pending = input.runAfterInteractions(() => {
        if (scheduledGeneration !== generation) {
          return;
        }
        pending = null;
        interactionReady = true;
        signalWhenVisible();
      });
    },
  };
}
