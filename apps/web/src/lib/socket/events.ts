import type {
  ChatMessage,
  DMConversationDTO,
  DMMessagePayload,
  MessageReaction,
} from "@wizards/types";
import type { FriendPresenceUpdateDto } from "@/lib/friends/types";

export interface NotificationSocketPayload {
  id: string;
  userId: string;
  type:
    | "MENTION"
    | "FRIEND_REQUEST"
    | "FRIEND_ACCEPTED"
    | "DM"
    | "SERVER_INVITE"
    | "SYSTEM"
    | "MODERATION";
  title: string;
  body: string;
  imageUrl: string | null;
  read: boolean;
  readAt: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

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
  "dm:join": (conversationId: string) => void;
  "dm:leave": (conversationId: string) => void;
  "dm:message:send": (data: {
    conversationId: string;
    content: string;
    replyToId?: string;
  }) => void;
  "dm:message:edit": (data: { messageId: string; content: string }) => void;
  "dm:message:delete": (data: { messageId: string }) => void;
  "dm:typing:start": (data: { conversationId: string }) => void;
  "dm:typing:stop": (data: { conversationId: string }) => void;
  "voice:join": (data: { channelId: string; serverId: string }) => void;
  "voice:leave": (data: { channelId: string; serverId: string }) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: ChatMessage) => void;
  "message:updated": (message: ChatMessage) => void;
  "message:deleted": (data: { messageId: string; channelId: string }) => void;
  "message:reaction_updated": (data: {
    messageId: string;
    reactions: MessageReaction[];
  }) => void;
  "server:unread:update": (data: { serverId: string; unreadCount: number }) => void;
  "dm:message:new": (message: DMMessagePayload) => void;
  "dm:message:updated": (message: DMMessagePayload) => void;
  "dm:message:deleted": (data: {
    messageId: string;
    conversationId: string;
  }) => void;
  "dm:typing:update": (data: {
    conversationId: string;
    typingUsers: Array<{ userId: string; username: string }>;
  }) => void;
  "dm:conversation:updated": (data: {
    conversationId: string;
    lastMessageAt: string;
    preview: string;
    hiddenAt: null;
    unreadCount: number;
    conversation: DMConversationDTO;
  }) => void;
  "dm:error": (data: {
    code:
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "BLOCKED"
      | "RATE_LIMITED"
      | "VALIDATION_ERROR"
      | "NOT_FOUND";
    message: string;
  }) => void;
  "presence:update": (data: FriendPresenceUpdateDto) => void;
  "typing:update": (data: { channelId: string; users: string[] }) => void;
  "notification:new": (notification: NotificationSocketPayload) => void;
  "voice:state:update": (data: {
    channelId: string;
    userId: string;
    action: "join" | "leave";
    participants: Array<{ userId: string; username: string; avatarUrl: string | null }>;
  }) => void;
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
  "presence:update": (data: FriendPresenceUpdateDto) => void;
  "typing:update": (data: { channelId: string; users: string[] }) => void;
}

export interface SocketData {
  userId: string;
  username: string;
  displayName: string;
  presenceCustomStatus: string | null;
  presenceStatus: FriendPresenceUpdateDto["status"];
  typingChannels: Set<string>;
}
