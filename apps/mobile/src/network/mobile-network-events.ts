import type { MobileNetworkStatus } from "./mobile-network-contract";

type OfflineAttemptListener = () => void;

/**
 * The connection class, kept next to the status.
 *
 * Telemetry needs it (a p95 that mixes wifi and cellular is not comparable) and so
 * does the speculative prefetch, which must not spend a metered link on
 * conversations nobody asked for.
 */
export type MobileNetworkClass = "cellular" | "offline" | "unknown" | "wifi";

let currentStatus: MobileNetworkStatus = "unknown";
let currentClass: MobileNetworkClass = "unknown";
let metered = false;
const offlineAttemptListeners = new Set<OfflineAttemptListener>();

export function getMobileNetworkStatusSnapshot(): MobileNetworkStatus {
  return currentStatus;
}

export function setMobileNetworkStatusSnapshot(
  status: MobileNetworkStatus,
  details: { readonly isExpensive?: boolean; readonly type?: string } = {},
): void {
  currentStatus = status;

  if (status === "offline") {
    currentClass = "offline";
  } else if (details.type === "wifi" || details.type === "ethernet") {
    currentClass = "wifi";
  } else if (details.type === "cellular") {
    currentClass = "cellular";
  } else {
    currentClass = "unknown";
  }

  metered = details.isExpensive === true || currentClass === "cellular";
}

export function getMobileNetworkClassSnapshot(): MobileNetworkClass {
  return currentClass;
}

/** True when the link costs the reader money or battery to speculate on. */
export function isMobileNetworkMetered(): boolean {
  return metered;
}

export function emitMobileOfflineMutationAttempt(): void {
  for (const listener of offlineAttemptListeners) {
    listener();
  }
}

export function subscribeMobileOfflineMutationAttempt(
  listener: OfflineAttemptListener,
): () => void {
  offlineAttemptListeners.add(listener);
  return () => offlineAttemptListeners.delete(listener);
}
