"use client";

import { create } from "zustand";

interface VoiceStoreState {
  activeChannelId: string | null;
  isDeafened: boolean;
  isMuted: boolean;
  serverId: string | null;
  sessionId: string | null;
  join: (input: { channelId: string; serverId: string; sessionId: string }) => void;
  leave: () => void;
  toggleDeafen: () => void;
  toggleMute: () => void;
  setDeafened: (isDeafened: boolean) => void;
  setMuted: (isMuted: boolean) => void;
}

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  activeChannelId: null,
  isDeafened: false,
  isMuted: false,
  serverId: null,
  sessionId: null,
  join: ({ channelId, serverId, sessionId }) =>
    set({
      activeChannelId: channelId,
      isDeafened: false,
      isMuted: false,
      serverId,
      sessionId,
    }),
  leave: () =>
    set({
      activeChannelId: null,
      isDeafened: false,
      isMuted: false,
      serverId: null,
      sessionId: null,
    }),
  toggleDeafen: () =>
    set((state) => ({
      isDeafened: !state.isDeafened,
    })),
  toggleMute: () =>
    set((state) => ({
      isMuted: !state.isMuted,
    })),
  setDeafened: (isDeafened) =>
    set({
      isDeafened,
    }),
  setMuted: (isMuted) =>
    set({
      isMuted,
    }),
}));
