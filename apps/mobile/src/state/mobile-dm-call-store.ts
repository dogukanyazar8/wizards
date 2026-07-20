import { create } from "zustand";

import type { MobileDMCallSession } from "../voice/mobile-dm-call-state";

export type MobileDMCallStoreState = {
  /** The single DM call this device is part of; DM calls are one-to-one and exclusive. */
  readonly session: MobileDMCallSession | null;
  /** Hang-up owned by the DM call feature; screens call it instead of re-emitting signals. */
  readonly endCall: (() => Promise<void>) | null;
  clear(): void;
  setEndCallHandler(handler: (() => Promise<void>) | null): void;
  setSession(session: MobileDMCallSession | null): void;
  updateSession(update: (current: MobileDMCallSession) => MobileDMCallSession): void;
};

/**
 * Call state lives in a store rather than a hook so the voice-room route can pick the
 * right screen (7a/7b while ringing, 5e/5f once answered) without prop drilling.
 */
export const useMobileDMCallStore = create<MobileDMCallStoreState>((set) => ({
  session: null,
  endCall: null,
  clear: () => set({ session: null }),
  setEndCallHandler: (endCall) => set({ endCall }),
  setSession: (session) => set({ session }),
  updateSession: (update) =>
    set((state) => ({ session: state.session ? update(state.session) : null })),
}));
