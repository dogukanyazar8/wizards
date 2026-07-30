import AsyncStorage from "@react-native-async-storage/async-storage";

import { readMobileAboutPreferences } from "./mobile-about-preferences";

export type OpenAboutBetaConsent = () => Promise<boolean>;

export interface AboutBetaConsentRequest {
  readonly id: number;
}

interface ActiveAboutBetaConsentRequest {
  readonly promise: Promise<boolean>;
  readonly resolve: (accepted: boolean) => void;
  readonly snapshot: AboutBetaConsentRequest;
}

let activeRequest: ActiveAboutBetaConsentRequest | null = null;
let openOperation: Promise<boolean> | null = null;
let nextRequestId = 1;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeAboutBetaConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAboutBetaConsentRequest(): AboutBetaConsentRequest | null {
  return activeRequest?.snapshot ?? null;
}

function getActiveRequest(): ActiveAboutBetaConsentRequest | null {
  return activeRequest;
}

/**
 * One promise broker for both 1a and 2c. Concurrent callers share the visible
 * sheet and receive the same answer instead of stacking duplicate overlays.
 */
async function createAboutBetaConsentOperation(): Promise<boolean> {
  const existingRequest = getActiveRequest();
  if (existingRequest !== null) {
    return existingRequest.promise;
  }

  const preferences = await readMobileAboutPreferences(AsyncStorage);
  if (preferences.betaConsentAt !== null) {
    return true;
  }

  // A second caller can arrive while the AsyncStorage read above is in flight.
  const concurrentRequest = getActiveRequest();
  if (concurrentRequest !== null) {
    return concurrentRequest.promise;
  }

  let resolveRequest!: (accepted: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    resolveRequest = resolve;
  });
  activeRequest = {
    promise,
    resolve: resolveRequest,
    snapshot: { id: nextRequestId++ },
  };
  notifyListeners();
  return promise;
}

export function openAboutBetaConsent(): Promise<boolean> {
  if (openOperation !== null) {
    return openOperation;
  }

  const operation = createAboutBetaConsentOperation();
  openOperation = operation;
  const clearOperation = () => {
    if (openOperation === operation) {
      openOperation = null;
    }
  };
  void operation.then(clearOperation, clearOperation);
  return operation;
}

/** Completes the active request. Scrim, cancel and Android back all settle false. */
export function settleAboutBetaConsent(accepted: boolean): void {
  const request = activeRequest;
  if (request === null) {
    return;
  }

  activeRequest = null;
  notifyListeners();
  request.resolve(accepted);
}
