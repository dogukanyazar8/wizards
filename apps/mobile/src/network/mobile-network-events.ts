import type { MobileNetworkStatus } from "./mobile-network-contract";

type OfflineAttemptListener = () => void;

let currentStatus: MobileNetworkStatus = "unknown";
const offlineAttemptListeners = new Set<OfflineAttemptListener>();

export function getMobileNetworkStatusSnapshot(): MobileNetworkStatus {
  return currentStatus;
}

export function setMobileNetworkStatusSnapshot(status: MobileNetworkStatus): void {
  currentStatus = status;
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
