type MobilePrivacyShieldUncoveredObserver = () => void;

let covered = true;
const uncoveredObservers = new Set<MobilePrivacyShieldUncoveredObserver>();

export function isMobilePrivacyShieldCovered(): boolean {
  return covered;
}

export function observeMobilePrivacyShieldUncovered(
  observer: MobilePrivacyShieldUncoveredObserver,
): () => void {
  uncoveredObservers.add(observer);
  return () => uncoveredObservers.delete(observer);
}

/** Called by the UI-thread-backed shield only after its opaque cover is gone. */
export function setMobilePrivacyShieldCovered(nextCovered: boolean): void {
  if (covered === nextCovered) {
    return;
  }

  covered = nextCovered;
  if (!covered) {
    uncoveredObservers.forEach((observer) => observer());
  }
}
