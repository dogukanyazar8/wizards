import type {
  ChatMessage,
  DMConversationDTO,
  DMMessagePayload,
  MessageReaction,
  UploadedAttachmentInput,
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

export interface UserProfileUpdatedPayload {
  avatarUrl: string | null;
  customStatus: string | null;
  displayName: string | null;
  status: FriendPresenceUpdateDto["status"];
  userId: string;
  username: string;
}

export interface VoiceInvitePayload {
  channelId: string;
  channelName: string;
  createdAt: string;
  expiresAt: string;
  fromUser: {
    avatarUrl: string | null;
    displayName: string;
    id: string;
    username: string;
  };
  id: string;
  serverId: string;
  serverName: string;
}

export interface VoiceInviteErrorPayload {
  channelId?: string;
  code: string;
  inviteId?: string;
  message: string;
  targetUserId?: string;
}

export interface VoiceInviteStatusPayload {
  channelId: string;
  inviteId: string;
  serverId: string;
  status: "accepted" | "declined";
  targetUserId: string;
}

export interface VoiceAudioLevelPayload {
  audioLevel: number;
  channelId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
}

export interface ClientToServerEvents {
  "channel:join": (channelId: string) => void;
  "channel:leave": (channelId: string) => void;
  "message:send": (data: {
    attachments?: UploadedAttachmentInput[];
    channelId: string;
    content: string;
    replyToId?: string;
    threadParentId?: string;
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
    attachments?: UploadedAttachmentInput[];
    conversationId: string;
    content: string;
    replyToId?: string;
    threadParentId?: string;
  }) => void;
  "dm:message:edit": (data: { messageId: string; content: string }) => void;
  "dm:message:delete": (data: { messageId: string }) => void;
  "dm:message:react": (data: { messageId: string; emoji: string }) => void;
  "dm:message:unreact": (data: { messageId: string; emoji: string }) => void;
  "dm:typing:start": (data: { conversationId: string }) => void;
  "dm:typing:stop": (data: { conversationId: string }) => void;
  "dm:screenshare:start": (data: { conversationId: string }) => void;
  "dm:screenshare:accept": (data: {
    conversationId: string;
    fromUserId: string;
  }) => void;
  "dm:screenshare:decline": (data: {
    conversationId: string;
    fromUserId: string;
  }) => void;
  "dm:screenshare:stop": (data: { conversationId: string }) => void;
  "presence:activity": (data: { status: "ONLINE" | "IDLE" }) => void;
  "voice:join": (data: { channelId: string; serverId: string }) => void;
  "voice:leave": (data: { channelId: string; serverId: string }) => void;
  "voice:invite:accept": (data: {
    channelId: string;
    inviteId: string;
    serverId: string;
  }) => void;
  "voice:invite:decline": (data: {
    channelId: string;
    inviteId: string;
    serverId: string;
  }) => void;
  "voice:invite:send": (data: {
    channelId: string;
    serverId: string;
    targetUserId: string;
  }) => void;
  "voice:audio-level:update": (data: {
    audioLevel: number;
    channelId: string;
    isMuted: boolean;
    isSpeaking: boolean;
    serverId: string;
  }) => void;
  "voice:screenshare:update": (data: {
    channelId: string;
    isScreenSharing: boolean;
    serverId: string;
  }) => void;
}

export interface ServerToClientEvents {
  "friends:updated": (data: {
    reason:
      | "blocked"
      | "friend_request_accepted"
      | "friend_request_canceled"
      | "friend_request_received"
      | "friend_request_rejected"
      | "friend_removed"
      | "unblocked";
  }) => void;
  "message:new": (message: ChatMessage) => void;
  "channel:messages:stale": (data: {
    channelId: string;
    latestMessageId: string;
    serverId: string;
  }) => void;
  "message:updated": (message: ChatMessage) => void;
  "message:deleted": (data: {
    messageId: string;
    channelId: string;
    deletedById?: string;
    placeholderExpiresAt?: string | null;
  }) => void;
  "message:removed": (data: { messageId: string; channelId: string }) => void;
  "message:history_cleared": (data: { channelId: string }) => void;
  "message:pins_updated": (data: { channelId: string }) => void;
  "message:reaction_updated": (data: {
    messageId: string;
    reactions: MessageReaction[];
  }) => void;
  "server:unread:update": (data: {
    mentionCount?: number;
    serverId: string;
    unreadCount: number;
  }) => void;
  "server:membership:removed": (data: {
    reason: "deleted" | "kicked" | "left";
    serverId: string;
  }) => void;
  "server:membership:added": (data: { serverId: string }) => void;
  "server:settings:updated": (data: { serverId: string }) => void;
  "dm:message:new": (message: DMMessagePayload) => void;
  "dm:message:updated": (message: DMMessagePayload) => void;
  "dm:message:deleted": (data: {
    messageId: string;
    conversationId: string;
    deletedById?: string;
  }) => void;
  "dm:message:removed": (data: {
    messageId: string;
    conversationId: string;
  }) => void;
  "dm:message:reaction_updated": (data: {
    messageId: string;
    reactions: MessageReaction[];
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
  "dm:screenshare:started": (data: {
    conversationId: string;
    userId: string;
    username: string;
    displayName: string | null;
  }) => void;
  "dm:screenshare:accepted": (data: {
    conversationId: string;
    userId: string;
  }) => void;
  "dm:screenshare:declined": (data: {
    conversationId: string;
    userId: string;
  }) => void;
  "dm:screenshare:stopped": (data: {
    conversationId: string;
    userId: string;
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
  "user:profile:updated": (data: UserProfileUpdatedPayload) => void;
  "typing:update": (data: { channelId: string; users: string[] }) => void;
  "notification:new": (notification: NotificationSocketPayload) => void;
  "voice:state:update": (data: {
    channelId: string;
    userId: string;
    action: "join" | "leave";
    participants: Array<{
      userId: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
      isScreenSharing?: boolean;
    }>;
  }) => void;
  "voice:screenshare:update": (data: {
    channelId: string;
    isScreenSharing: boolean;
    userId: string;
  }) => void;
  "voice:invite:accepted": (data: {
    channelId: string;
    inviteId: string;
    serverId: string;
  }) => void;
  "voice:invite:error": (data: VoiceInviteErrorPayload) => void;
  "voice:invite:received": (data: VoiceInvitePayload) => void;
  "voice:invite:sent": (data: {
    channelId: string;
    expiresAt: string;
    inviteId: string;
    targetUserId: string;
  }) => void;
  "voice:invite:status": (data: VoiceInviteStatusPayload) => void;
  "voice:audio-level:update": (data: VoiceAudioLevelPayload) => void;
  error: (data: { code: string; message: string }) => void;
}

export interface InterServerEvents {
  "message:new": (message: ChatMessage) => void;
  "message:updated": (message: ChatMessage) => void;
  "message:deleted": (data: {
    messageId: string;
    channelId: string;
    deletedById?: string;
    placeholderExpiresAt?: string | null;
  }) => void;
  "message:removed": (data: { messageId: string; channelId: string }) => void;
  "message:history_cleared": (data: { channelId: string }) => void;
  "message:reaction_updated": (data: {
    messageId: string;
    reactions: MessageReaction[];
  }) => void;
  "presence:update": (data: FriendPresenceUpdateDto) => void;
  "user:profile:updated": (data: UserProfileUpdatedPayload) => void;
  "typing:update": (data: { channelId: string; users: string[] }) => void;
}

export interface SocketData {
  userId: string;
  username: string;
  displayName: string;
  appSessionKey?: string;
  presenceCustomStatus: string | null;
  presenceStatus: FriendPresenceUpdateDto["status"];
  typingChannels: Set<string>;
  lastVoiceAudioLevelAt?: number;
  voiceRooms: Set<string>;
}
