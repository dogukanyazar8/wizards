import { create } from "zustand";
import {
  createInitialMobileChannelTypingState,
  type MobileChannelTypingState,
} from "../realtime/mobile-typing-state";

/**
 * "Yazıyor" state, kept out of the realtime context on purpose.
 *
 * Typing arrives for every channel and conversation the viewer participates in,
 * open or not. While it lived in the realtime provider's `useState` and travelled
 * through that context, the product root read it — so a stranger typing in an
 * unrelated channel re-rendered the whole app tree, rebuilt every screen-props
 * object, and re-rendered the navigator and the tab bar with them.
 *
 * As a store, the only components that move are the ones that select it: the chat
 * header's label and the inbox rows.
 */
export type MobileTypingStoreState = {
  readonly channels: MobileChannelTypingState;
  readonly dms: MobileChannelTypingState;
  patchChannels(updater: (current: MobileChannelTypingState) => MobileChannelTypingState): void;
  patchDMs(updater: (current: MobileChannelTypingState) => MobileChannelTypingState): void;
  reset(): void;
};

export const useMobileTypingStore = create<MobileTypingStoreState>((set) => ({
  channels: createInitialMobileChannelTypingState(),
  dms: createInitialMobileChannelTypingState(),
  patchChannels: (updater) => set((current) => ({ channels: updater(current.channels) })),
  patchDMs: (updater) => set((current) => ({ dms: updater(current.dms) })),
  reset: () =>
    set({
      channels: createInitialMobileChannelTypingState(),
      dms: createInitialMobileChannelTypingState(),
    }),
}));

/**
 * Stable writers for the realtime provider. The provider used to hold the state
 * itself, so its handlers keep the `(current) => next` shape they always had.
 */
export const mobileTypingStoreWriters = Object.freeze({
  patchChannels: (updater: (current: MobileChannelTypingState) => MobileChannelTypingState) =>
    useMobileTypingStore.getState().patchChannels(updater),
  patchDMs: (updater: (current: MobileChannelTypingState) => MobileChannelTypingState) =>
    useMobileTypingStore.getState().patchDMs(updater),
  reset: () => useMobileTypingStore.getState().reset(),
});
