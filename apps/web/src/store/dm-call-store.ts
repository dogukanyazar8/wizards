import { create } from "zustand";

import {
  createIncomingCall,
  createJoiningCall,
  createOutgoingCall,
  markCallConnected,
  markCallConnecting,
  type DMCallPeer,
  type DMCallSession,
} from "@/lib/dm/call-state";

type DMCallStoreState = {
  /** The single DM call this client is part of; DM calls are one-to-one and exclusive. */
  session: DMCallSession | null;
  /** True when the user collapsed the call into the reminder bar to keep chatting. */
  isMinimized: boolean;
  errorMessage: string | null;
  startOutgoing: (input: {
    conversationId: string;
    peer: DMCallPeer | null;
    video: boolean;
  }) => void;
  receiveIncoming: (input: {
    conversationId: string;
    expiresAt: string;
    peer: DMCallPeer;
    video: boolean;
  }) => void;
  /** Entering a call that is already running; no ring, so no ring deadline. */
  startJoining: (input: { conversationId: string; peer?: DMCallPeer | null }) => void;
  setConnecting: (video?: boolean) => void;
  setConnected: (video?: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  clear: () => void;
};

export const useDMCallStore = create<DMCallStoreState>((set) => ({
  session: null,
  isMinimized: false,
  errorMessage: null,
  startOutgoing: ({ conversationId, peer, video }) =>
    set({
      errorMessage: null,
      isMinimized: false,
      session: createOutgoingCall({ conversationId, now: Date.now(), peer, video }),
    }),
  receiveIncoming: ({ conversationId, expiresAt, peer, video }) =>
    set({
      errorMessage: null,
      isMinimized: false,
      session: createIncomingCall({ conversationId, expiresAt, peer, video }),
    }),
  startJoining: ({ conversationId, peer }) =>
    set({
      errorMessage: null,
      isMinimized: false,
      session: createJoiningCall({ conversationId, peer: peer ?? null }),
    }),
  setConnecting: (video) =>
    set((state) => ({
      session: state.session ? markCallConnecting(state.session, video) : null,
    })),
  setConnected: (video) =>
    set((state) => ({
      session: state.session ? markCallConnected(state.session, video) : null,
    })),
  setMinimized: (isMinimized) => set({ isMinimized }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  clear: () => set({ errorMessage: null, isMinimized: false, session: null }),
}));
