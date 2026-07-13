export type MobileNetworkStatus = "offline" | "online" | "unknown";

export interface MobileNetworkStateSource {
  readonly isConnected: boolean | null;
  readonly isInternetReachable: boolean | null;
}

export function toMobileNetworkStatus(state: MobileNetworkStateSource): MobileNetworkStatus {
  if (state.isConnected === false || state.isInternetReachable === false) {
    return "offline";
  }
  if (state.isConnected === true) {
    return "online";
  }
  return "unknown";
}

export function isMobileMutationMethod(method: string | undefined): boolean {
  return (method ?? "GET").toUpperCase() !== "GET";
}

export class MobileOfflineError extends Error {
  readonly code = "mobile_offline";

  constructor() {
    super("This action requires an internet connection.");
    this.name = "MobileOfflineError";
  }
}
