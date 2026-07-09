import { create } from "zustand";

export type MobileActiveTargetState = {
  readonly channelId: string | null;
  readonly conversationId: string | null;
  readonly serverId: string | null;
  readonly voiceChannelId: string | null;
  reset(): void;
  setConversation(conversationId: string | null): void;
  setServer(serverId: string | null): void;
  setTextChannel(serverId: string, channelId: string): void;
  setVoiceChannel(serverId: string, voiceChannelId: string): void;
};

const initialState = {
  channelId: null,
  conversationId: null,
  serverId: null,
  voiceChannelId: null,
} as const;

export const useMobileActiveTargetStore = create<MobileActiveTargetState>((set) => ({
  ...initialState,
  reset: () => set(initialState),
  setConversation: (conversationId) =>
    set({
      channelId: null,
      conversationId,
      serverId: null,
      voiceChannelId: null,
    }),
  setServer: (serverId) =>
    set({
      channelId: null,
      conversationId: null,
      serverId,
      voiceChannelId: null,
    }),
  setTextChannel: (serverId, channelId) =>
    set({
      channelId,
      conversationId: null,
      serverId,
      voiceChannelId: null,
    }),
  setVoiceChannel: (serverId, voiceChannelId) =>
    set({
      channelId: null,
      conversationId: null,
      serverId,
      voiceChannelId,
    }),
}));
