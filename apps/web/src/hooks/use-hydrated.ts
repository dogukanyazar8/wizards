"use client";

import { useSyncExternalStore } from "react";

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, getClientSnapshot, getServerSnapshot);
}
