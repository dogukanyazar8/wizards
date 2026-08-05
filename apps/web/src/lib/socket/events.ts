import type {
  ChatMessage,
  DMConversationDTO,
  DMMessagePayload,
  MessageReaction,
  UploadedAttachmentInput,
} from "@wizards/types";
import type { ClientAttribution } from "@/lib/analytics/client-attribution";
import type { FriendPresenceUpdateDto } from "@/lib/friends/types";

/**
 * The names and avatars behind a notification live on other tables, so a client
 * that only had the row still needed a round trip before it could draw the item.
 * Emitters that already hold the actor, channel or server pass them here and the
 * mobile feed renders straight from the event; everything is optional so an
 * emitter with nothing extra to say stays exactly as it was.
 */
export interface NotificationSocketActor {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
}

export interface NotificationSocketContext {
  actor?: NotificationSocketActor | null;
  channel?: { id: string; name: string } | null;
  server?: { id: string; name: string } | null;
}

export interface NotificationSocketPayload extends NotificationSocketContext {
  id: string;
  userId: string;
  type:
    | "BADGE"
    | "FEEDBACK"
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
    /**
     * The id the sender's optimistic bubble is rendered under. Stored nowhere —
     * the server echoes it back on the author's own copy of the message so the
     * echo lands in that bubble instead of beside it.
     */
    clientNonce?: string;
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
    /** See `message:send`: the author's own bubble id, echoed back to them. */
    clientNonce?: string;
    conversationId: string;
    content: string;
    replyToId?: string;
    threadParentId?: string;
  }) => void;
  "dm:message:edit": (data: { messageId: string; content: string }) => void;
  "dm:message:delete": (data: { messageId: string }) => void;
  "dm:message:react": (data: { messageId: string; emoji: string }) => void;
  "dm:message:unreact": (data: { messageId: string; emoji: string }) => void;
  /**
   * "This client now holds the newest message in that conversation." Sent by the
   * receiving client, which is the only party that can honestly claim delivery.
   */
  "dm:message:delivered": (data: { conversationId: string }) => void;
  "dm:typing:start": (data: { conversationId: string }) => void;
  "dm:typing:stop": (data: { conversationId: string }) => void;
  "dm:call:start": (data: { conversationId: string; video: boolean }) => void;
  "dm:call:accept": (data: { conversationId: string; fromUserId: string; video: boolean }) => void;
  "dm:call:decline": (data: { conversationId: string; fromUserId: string }) => void;
  "dm:call:cancel": (data: { conversationId: string }) => void;
  "dm:call:end": (data: { conversationId: string }) => void;
  "presence:activity": (data: { status: "ONLINE" | "IDLE" }) => void;
  "voice:join": (data: { channelId: string; serverId: string }) => void;
  "voice:leave": (data: { channelId: string; serverId: string }) => void;
  "voice:states:watch": (data: { serverId: string }) => void;
  "voice:states:unwatch": (data: { serverId: string }) => void;
  "voice:invite:accept": (data: { channelId: string; inviteId: string; serverId: string }) => void;
  "voice:invite:decline": (data: { channelId: string; inviteId: string; serverId: string }) => void;
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
  /**
   * F9 tray badge. The server counts open moderation cases and says so; the
   * desktop tray only renders the number it is given. Sent to the rooms of
   * admins who may read the queue, so a count is never a side channel that
   * tells a non-admin how much moderation work exists.
   */
  "admin:open-case-count": (data: { count: number }) => void;
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
    lastMessage: {
      author: { displayName: string | null; id: string; username: string };
      createdAt: string;
      id: string;
      text: string;
    } | null;
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
  "message:reaction_updated": (data: { messageId: string; reactions: MessageReaction[] }) => void;
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
  "dm:message:removed": (data: { messageId: string; conversationId: string }) => void;
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
  "dm:conversation:read": (data: {
    conversationId: string;
    lastReadAt: string | null;
    userId: string;
  }) => void;
  /** Second tick: `userId`'s client received everything up to `lastDeliveredAt`. */
  "dm:conversation:delivered": (data: {
    conversationId: string;
    lastDeliveredAt: string | null;
    userId: string;
  }) => void;
  "dm:call:incoming": (data: {
    conversationId: string;
    expiresAt: string;
    fromUser: {
      avatarUrl: string | null;
      displayName: string | null;
      id: string;
      username: string;
    };
    video: boolean;
  }) => void;
  "dm:call:accepted": (data: { conversationId: string; userId: string; video: boolean }) => void;
  "dm:call:declined": (data: { conversationId: string; userId: string }) => void;
  "dm:call:cancelled": (data: { conversationId: string; userId: string }) => void;
  "dm:call:ended": (data: { conversationId: string; userId: string }) => void;
  "dm:error": (data: {
    code:
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "BLOCKED"
      | "RATE_LIMITED"
      | "RATE_LIMIT_UNAVAILABLE"
      | "VALIDATION_ERROR"
      | "NOT_FOUND";
    message: string;
  }) => void;
  "presence:update": (data: FriendPresenceUpdateDto) => void;
  "user:profile:updated": (data: UserProfileUpdatedPayload) => void;
  "typing:update": (data: { channelId: string; users: string[] }) => void;
  "notification:new": (notification: NotificationSocketPayload) => void;
  /**
   * A flag changed while people were connected. The payload carries only the
   * key: every client re-reads its own answer, because a rollout percentage
   * resolves differently per person.
   */
  "feature-flags:changed": (data: { key: string }) => void;
  /**
   * §2 "1a".5 — a friend entered or left a voice room. Friend-scoped, unlike
   * `voice:state:update`, which only reaches that channel's watchers.
   */
  "friends:voice:update": (data: {
    userId: string;
    voiceRoom: {
      channelId: string;
      channelName: string;
      serverId: string;
      serverName: string;
    } | null;
  }) => void;
  "voice:state:update": (data: {
    channelId: string;
    serverId: string;
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
    serverId: string;
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
  "message:reaction_updated": (data: { messageId: string; reactions: MessageReaction[] }) => void;
  "presence:update": (data: FriendPresenceUpdateDto) => void;
  "user:profile:updated": (data: UserProfileUpdatedPayload) => void;
  "typing:update": (data: { channelId: string; users: string[] }) => void;
}

export interface SocketData {
  userId: string;
  username: string;
  displayName: string;
  appSessionKey?: string;
  /**
   * Resolved once at handshake. Voice sessions cannot join back to `AppSession`
   * (`VoiceState.sessionId` is a different key), so media metrics read the
   * client from here instead.
   */
  clientAttribution?: ClientAttribution;
  presenceCustomStatus: string | null;
  presenceStatus: FriendPresenceUpdateDto["status"];
  typingChannels: Set<string>;
  lastVoiceAudioLevelAt?: number;
  voiceStateViewerChannelsByServer: Map<string, Set<string>>;
  voiceRooms: Set<string>;
}
