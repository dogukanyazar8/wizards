import type { ChatMessage, MessageReaction } from "@wizards/types";

export interface ClientToServerEvents {
  "channel:join": (channelId: string) => void;
  "channel:leave": (channelId: string) => void;
  "message:send": (data: {
    channelId: string;
    content: string;
    replyToId?: string;
  }) => void;
  "message:edit": (data: { messageId: string; content: string }) => void;
  "message:delete": (messageId: string) => void;
  "message:react": (data: { messageId: string; emoji: string }) => void;
  "message:unreact": (data: { messageId: string; emoji: string }) => void;
  "typing:start": (channelId: string) => void;
  "typing:stop": (channelId: string) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: ChatMessage) => void;
  "message:updated": (message: ChatMessage) => void;
  "message:deleted": (data: { messageId: string; channelId: string }) => void;
  "message:reaction_updated": (data: {
    messageId: string;
    reactions: MessageReaction[];
  }) => void;
  "typing:update": (data: { channelId: string; users: string[] }) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface InterServerEvents {
  "message:new": (message: ChatMessage) => void;
  "message:updated": (message: ChatMessage) => void;
  "message:deleted": (data: { messageId: string; channelId: string }) => void;
  "message:reaction_updated": (data: {
    messageId: string;
    reactions: MessageReaction[];
  }) => void;
  "typing:update": (data: { channelId: string; users: string[] }) => void;
}

export interface SocketData {
  userId: string;
  displayName: string;
  typingChannels: Set<string>;
}
