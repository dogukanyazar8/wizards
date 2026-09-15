import type {
  ChatMessage,
  DMConversationDTO,
  DMMessagePayload,
  DMNotifyLevel,
  GroupCallStateDTO,
  Mention,
  MentionCounts,
  MessageReaction,
  NotifUnreadCounts,
  PresenceVisibility,
  SettingsUpdatedEvent,
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
  /**
   * Ayarlar Ş2 §6 — panelin dörtlü sayacı, olayın içinde.
   *
   * İstemci sayacı **artırmaz**, sunucudan okur; iki sekme açıkken artırma kaçınılmaz olarak
   * ayrışır. Alan **opsiyonel**, çünkü `notification:new` on sekiz ayrı yerden yayılıyor ve
   * onların çoğu başka şeritlerin dosyası (`message-notification-service.ts` Ş1'in). Sayacı
   * taşımayan bir yayımcıdan gelen olay, istemciyi `/unread-count` okumaya düşürür — yanlış
   * sayı göstermeye değil. Yayımcıların tamamı `withNotificationCounts` ile beslendiğinde
   * (Ş11 / Ş13) alan zorunluya çevrilir.
   */
  counts?: NotifUnreadCounts;
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

/** Ayarlar Ş2 §6. `id: null` = toplu okuma. */
export interface NotificationReadSocketPayload {
  counts: NotifUnreadCounts;
  id: string | null;
  read: boolean;
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

export type MessageSendAck =
  { messageId: string; ok: true } | { code: string; message: string; ok: false };

export interface ClientToServerEvents {
  "channel:join": (channelId: string) => void;
  "channel:leave": (channelId: string) => void;
  "message:send": (
    data: {
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
    },
    acknowledge?: (result: MessageSendAck) => void,
  ) => void;
  "message:edit": (data: { messageId: string; content: string }) => void;
  "message:delete": (messageId: string) => void;
  "message:react": (data: { messageId: string; emoji: string }) => void;
  "message:unreact": (data: { messageId: string; emoji: string }) => void;
  "typing:start": (channelId: string) => void;
  "typing:stop": (channelId: string) => void;
  "dm:join": (conversationId: string) => void;
  "dm:leave": (conversationId: string) => void;
  "dm:message:send": (
    data: {
      attachments?: UploadedAttachmentInput[];
      /** See `message:send`: the author's own bubble id, echoed back to them. */
      clientNonce?: string;
      conversationId: string;
      content: string;
      replyToId?: string;
      threadParentId?: string;
    },
    acknowledge?: (result: MessageSendAck) => void,
  ) => void;
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
  /**
   * Faz 2 §D3. Entering a group call that is already running — no ring, because
   * the people inside are already talking.
   */
  "dm:call:join": (data: { conversationId: string; video?: boolean }) => void;
  /** Faz 2 §D3. Leaving without ending the call for everybody else. */
  "dm:call:leave": (data: { conversationId: string }) => void;
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
  /**
   * Etkinlikler Ş4. Herkese açık etkinlik odasına abonelik `/events` rotasında açılır ve
   * rotadan çıkınca kapanır — her kullanıcıyı kalıcı olarak herkese açık etkinlik trafiğine
   * bağlamak gereksiz. Sunucu odaları (`server:<id>`) zaten üyelikten geliyor, ikinci bir
   * abonelik istemiyor.
   */
  "events:public:watch": () => void;
  "events:public:unwatch": () => void;
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
    reason: "banned" | "deleted" | "kicked" | "left";
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
  /**
   * Faz 2 §C4. The disappearing sweep removed these messages for good. Sent
   * *after* the delete (§4.10), so a client acting on it cannot re-fetch them.
   */
  "dm:message:expired": (data: { conversationId: string; messageIds: string[] }) => void;
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
  /** A group the viewer is now in. Lands in their inbox without a refetch. */
  "dm:conversation:created": (data: { conversationId: string }) => void;
  "dm:conversation:members_changed": (data: { conversationId: string }) => void;
  /** The viewer is no longer a participant. Drop the row, close the chat. */
  "dm:conversation:removed": (data: { conversationId: string }) => void;
  /**
   * Mesajlar §15.5.3 `Geçmişi temizle`. Nothing was deleted: every participant's
   * `historyFromAt` moved to `clearedAt`, so an open client has to drop what it
   * already holds rather than trust its cache.
   *
   * Sent to the conversation room *and* to each personal room, because the rail
   * preview of a member who does not have the chat open is stale in exactly the
   * same way the message list is.
   */
  "dm:conversation:history_cleared": (data: { clearedAt: string; conversationId: string }) => void;
  /** Mesajlar karar #7. Opaque invalidation; recipients re-read their authorized list. */
  "dm:conversation:pins": (data: { conversationId: string }) => void;
  /**
   * Mesajlar karar #1. One event for casting, moving and withdrawing a vote.
   * Opaque invalidation only; viewer-specific poll DTO comes from authorized GET.
   */
  "poll:updated": (
    data:
      | { channelId: string; conversationId?: never; pollId: string }
      | { channelId?: never; conversationId: string; pollId: string },
  ) => void;
  "dm:conversation:read": (data: {
    conversationId: string;
    lastReadAt: string | null;
    userId: string;
  }) => void;
  /**
   * Mesajlar §17 / karar K8. Personal state, so it goes to the one person it is
   * about — the same room `dm:conversation:notify` uses, because nobody else may
   * learn that this conversation was silenced.
   *
   * `notifyLevel` rides along rather than arriving as a second event: the two
   * columns are written in one statement, and splitting the news would let one
   * tab draw the header pill and the notification radio out of step.
   */
  "dm:conversation:mute": (data: {
    conversationId: string;
    muted: boolean;
    mutedUntil: string | null;
    notifyLevel: DMNotifyLevel;
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
  /**
   * Faz 2 §D3 / E4. Who is in the group call right now, sent to every member of
   * the conversation on every change. The client reads this rather than
   * reconstructing a roster from the ring and hang-up signals it happened to
   * see; `active: false` is the call ending.
   */
  "dm:call:state": (data: GroupCallStateDTO) => void;
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
   * Ayarlar Ş2 §6 — bir satırın okundu durumu **çevrildi**.
   *
   * `id: null` toplu okumadır (`markAllRead`): tek tek on satır yaymak, panelin sayaç ile
   * liste arasını on kez tutarsız bırakırdı. `counts` her zaman dolu — olayı alıp sayacı ayrıca
   * sorgulamak, iki istek arasındaki pencerede yanlış sayı göstermektir (`mention:state` ile
   * aynı gerekçe).
   */
  "notification:read": (payload: NotificationReadSocketPayload) => void;
  /**
   * Bahsedilmeler Ş3. Üç olay, hepsi `user:<id>` odasına — bir bahsetme kartı yalnız
   * bahsedilenin ekranında var.
   *
   * `notification:new` **kaldırılmadı**: zil menüsü ile bahsetme ekranı ayrı yüzeyler ve bir
   * bahsetme bildirimi her iki olayı da taşır. Sayaçlar olayın içinde geliyor, çünkü olayı
   * alıp sayacı ayrıca sorgulamak, iki istek arasındaki pencerede yanlış sayı göstermektir.
   */
  "mention:new": (payload: { counts: MentionCounts; mention: Mention }) => void;
  "mention:state": (payload: {
    counts: MentionCounts;
    dismissed: boolean;
    /** Bileşik kimlik: `"<source>:<refId>"` (`parseMentionId`). */
    mentionId: string;
    readLater: boolean;
    unread: boolean;
  }) => void;
  "mention:read-all": (payload: { counts: MentionCounts }) => void;
  /**
   * Ayarlar Ş1 §7. Sent to `user:{userId}` and nowhere else: a preference is one account's
   * business, and the payload carries the patch so the second tab and the desktop client can
   * apply it instead of re-reading the whole settings window.
   *
   * The shape is `SettingsUpdatedEventSchema` from `packages/types` — Ş0 fixed it there, so the
   * event has one definition rather than one per lane that emits it.
   */
  "settings:updated": (payload: SettingsUpdatedEvent) => void;
  /** Account-owned invalidation only; never sends session identifiers or security details. */
  "account:security:changed": (payload: { sessionsChanged: boolean }) => void;
  /**
   * Etkinlikler Ş4. Beş olay, `server:<serverId>` odasına; herkese açık etkinlikte ayrıca
   * `events:public` odasına.
   *
   * Hepsi **yamalanabilir** olacak kadar veri taşır: istemci listeyi yeniden çekmez, cache'i
   * yamalar. Yeniden çekilen bir sayfa listeyi baştan sıralar ve kullanıcının baktığı kart
   * ayağının altından kayar.
   */
  "event:created": (payload: { eventId: string; isPublic: boolean; serverId: string }) => void;
  "event:updated": (payload: {
    eventId: string;
    serverId: string;
    /** Saat değiştiyse sıra da değişebilir; istemci sayaçları da geçersiz kılar. */
    startsAtChanged: boolean;
  }) => void;
  /**
   * **Kimin** yanıt verdiğini taşımaz; yalnız yeni sayıları. İzleyicinin kendi yanıtı
   * `PUT /rsvp` cevabından geliyor ve ikinci bir kaynak ayrışma üretir.
   */
  "event:rsvp": (payload: {
    eventId: string;
    goingCount: number;
    maybeCount: number;
    serverId: string;
  }) => void;
  "event:live:started": (payload: { eventId: string; serverId: string }) => void;
  "event:live:ended": (payload: { eventId: string; serverId: string }) => void;
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
      isDeafened: boolean;
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
  error: (data: { code: string; message: string; retryAfterSeconds?: number }) => void;
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
  authSessionClientType?: "MOBILE" | "WEB";
  authSessionId?: string;
  authSessionStartedAtSeconds?: number;
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
  presenceVisibility?: PresenceVisibility;
  /** Channel viewer Redis memberships owned by this socket; drained on disconnect. */
  channelViewerIds?: Set<string>;
  /**
   * Server rooms this socket added itself to in the online-presence set (Task
   * 8). Disconnect and presence transitions read this back to know which
   * `server:<id>:online` sets to update — it is not persisted anywhere else.
   */
  onlineServerIds?: string[];
  typingChannels: Set<string>;
  lastVoiceAudioLevelAt?: number;
  voiceStateViewerChannelsByServer: Map<string, Set<string>>;
  voiceRooms: Set<string>;
}
