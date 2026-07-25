-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ONLINE', 'IDLE', 'DND', 'OFFLINE', 'INVISIBLE');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('TEXT', 'VOICE', 'ANNOUNCEMENT', 'STAGE', 'FORUM', 'THREAD', 'DM', 'GROUP_DM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MENTION', 'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'DM', 'SERVER_INVITE', 'SYSTEM', 'MODERATION');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');

-- CreateEnum
CREATE TYPE "ExplicitContentFilter" AS ENUM ('DISABLED', 'MEMBERS_WITHOUT_ROLES', 'ALL_MEMBERS');

-- CreateEnum
CREATE TYPE "UserExplicitContentFilter" AS ENUM ('DISABLED', 'FRIENDS', 'ALL');

-- CreateEnum
CREATE TYPE "FriendRequestPolicy" AS ENUM ('EVERYONE', 'MUTUAL_SERVERS', 'MUTUAL_FRIENDS', 'NOBODY');

-- CreateEnum
CREATE TYPE "DmPolicy" AS ENUM ('EVERYONE', 'FRIENDS', 'MUTUAL_SERVERS', 'NOBODY');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('WEB', 'DESKTOP', 'MOBILE');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'SUPPORT', 'ANALYST', 'MODERATOR');

-- CreateEnum
CREATE TYPE "AnalyticsClientType" AS ENUM ('WEB', 'DESKTOP', 'MOBILE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnalyticsDeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnalyticsMediaKind" AS ENUM ('VOICE', 'CAMERA', 'SCREEN_SHARE');

-- CreateEnum
CREATE TYPE "NotificationCampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttachmentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "MobileMediaUploadPurpose" AS ENUM ('PROFILE_AVATAR', 'PROFILE_BANNER', 'SERVER_ICON');

-- CreateEnum
CREATE TYPE "AnimateStickers" AS ENUM ('ALWAYS', 'INTERACTION', 'NEVER');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('ALL_MESSAGES', 'ONLY_MENTIONS');

-- CreateEnum
CREATE TYPE "UserReportReason" AS ENUM ('HARASSMENT', 'SPAM', 'INAPPROPRIATE', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PremiumType" AS ENUM ('NONE', 'BASIC', 'FULL');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('DEFAULT', 'REPLY', 'THREAD_STARTER', 'SYSTEM_JOIN', 'SYSTEM_LEAVE', 'SYSTEM_PINNED', 'CALL');

-- CreateEnum
CREATE TYPE "VideoQualityMode" AS ENUM ('AUTO', 'FULL');

-- CreateEnum
CREATE TYPE "MessageNotification" AS ENUM ('ALL', 'MENTIONS', 'NOTHING', 'DEFAULT');

-- CreateEnum
CREATE TYPE "PermissionTargetType" AS ENUM ('USER', 'ROLE');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DM', 'GROUP_DM');

-- CreateEnum
CREATE TYPE "AuditLogTargetType" AS ENUM ('USER', 'CHANNEL', 'ROLE', 'SERVER', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ScheduledEventStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduledEventEntityType" AS ENUM ('STAGE', 'VOICE', 'EXTERNAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameChangedAt" TIMESTAMP(3),
    "displayName" TEXT,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "avatarHash" TEXT,
    "bannerUrl" TEXT,
    "bannerColor" TEXT,
    "bannerOffsetX" DOUBLE PRECISION,
    "bannerOffsetY" DOUBLE PRECISION,
    "bio" VARCHAR(500),
    "pronouns" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'OFFLINE',
    "customStatus" TEXT,
    "customStatusEmoji" TEXT,
    "customStatusExpiresAt" TIMESTAMP(3),
    "theme" TEXT NOT NULL DEFAULT 'theme-dark',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "phoneNumber" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "bannedReason" TEXT,
    "sessionsRevokedAfter" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "premiumType" "PremiumType" NOT NULL DEFAULT 'NONE',
    "premiumSince" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ANALYST',
    "grantedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "clientType" "AnalyticsClientType" NOT NULL DEFAULT 'WEB',
    "deviceType" "AnalyticsDeviceType" NOT NULL DEFAULT 'UNKNOWN',
    "os" TEXT,
    "browser" TEXT,
    "countryCode" VARCHAR(2),
    "userAgentHash" TEXT,
    "ipHash" TEXT,
    "socketId" TEXT,
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDailyMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "appSeconds" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "dmMessageCount" INTEGER NOT NULL DEFAULT 0,
    "fileUploadCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedBytes" BIGINT NOT NULL DEFAULT 0,
    "voiceSeconds" INTEGER NOT NULL DEFAULT 0,
    "cameraSeconds" INTEGER NOT NULL DEFAULT 0,
    "screenShareSeconds" INTEGER NOT NULL DEFAULT 0,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaUsageSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT,
    "channelId" TEXT,
    "sessionId" TEXT NOT NULL,
    "kind" "AnalyticsMediaKind" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaUsageSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'theme-dark',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "messageDisplayCompact" BOOLEAN NOT NULL DEFAULT false,
    "developerMode" BOOLEAN NOT NULL DEFAULT false,
    "showCurrentGame" BOOLEAN NOT NULL DEFAULT true,
    "inlineAttachmentMedia" BOOLEAN NOT NULL DEFAULT true,
    "inlineEmbedMedia" BOOLEAN NOT NULL DEFAULT true,
    "renderEmbeds" BOOLEAN NOT NULL DEFAULT true,
    "renderReactions" BOOLEAN NOT NULL DEFAULT true,
    "messageFont" TEXT NOT NULL DEFAULT 'outfit',
    "animateEmoji" BOOLEAN NOT NULL DEFAULT true,
    "animateStickers" "AnimateStickers" NOT NULL DEFAULT 'INTERACTION',
    "enableTTS" BOOLEAN NOT NULL DEFAULT true,
    "defaultNotifications" "NotificationLevel" NOT NULL DEFAULT 'ALL_MESSAGES',
    "explicitContentFilter" "UserExplicitContentFilter" NOT NULL DEFAULT 'DISABLED',
    "friendRequestPolicy" "FriendRequestPolicy" NOT NULL DEFAULT 'EVERYONE',
    "dmPolicy" "DmPolicy" NOT NULL DEFAULT 'FRIENDS',
    "showReadReceipts" BOOLEAN NOT NULL DEFAULT true,
    "nsfwAllowed" BOOLEAN NOT NULL DEFAULT false,
    "serverRailWidth" INTEGER NOT NULL DEFAULT 136,
    "channelSidebarWidth" INTEGER NOT NULL DEFAULT 288,
    "notificationLimit" INTEGER NOT NULL DEFAULT 5,
    "notificationAutoClose" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "desktopNotifications" BOOLEAN NOT NULL DEFAULT true,
    "mobileNotifications" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "notificationSound" BOOLEAN NOT NULL DEFAULT true,
    "notificationSoundFile" TEXT NOT NULL DEFAULT 'default',
    "suppressEveryoneMentions" BOOLEAN NOT NULL DEFAULT false,
    "suppressRoleMentions" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),

    CONSTRAINT "UserNotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'WEB',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountReauthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountReauthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" "UserReportReason" NOT NULL,
    "details" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "body" VARCHAR(256) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendRequest" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" VARCHAR(4),
    "description" TEXT,
    "iconUrl" TEXT,
    "iconHash" TEXT,
    "bannerUrl" TEXT,
    "splashUrl" TEXT,
    "ownerId" TEXT NOT NULL,
    "invite_code" VARCHAR(8) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "discoverable" BOOLEAN NOT NULL DEFAULT false,
    "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'NONE',
    "defaultNotifications" "NotificationLevel" NOT NULL DEFAULT 'ALL_MESSAGES',
    "explicitContentFilter" "ExplicitContentFilter" NOT NULL DEFAULT 'DISABLED',
    "systemChannelId" TEXT,
    "rulesChannelId" TEXT,
    "maxMembers" INTEGER NOT NULL DEFAULT 500000,
    "preferredLocale" VARCHAR(10) NOT NULL DEFAULT 'en',
    "boostLevel" INTEGER NOT NULL DEFAULT 0,
    "boostCount" INTEGER NOT NULL DEFAULT 0,
    "vanity_url_code" TEXT,
    "afkChannelId" TEXT,
    "afkTimeout" INTEGER NOT NULL DEFAULT 300,
    "isNsfw" BOOLEAN NOT NULL DEFAULT false,
    "features" TEXT[],
    "messageCharacterLimit" INTEGER NOT NULL DEFAULT 2000,
    "deletedMessageNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "premiumSince" TIMESTAMP(3),
    "deaf" BOOLEAN NOT NULL DEFAULT false,
    "mute" BOOLEAN NOT NULL DEFAULT false,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "communicationDisabledUntil" TIMESTAMP(3),

    CONSTRAINT "ServerMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" INTEGER NOT NULL DEFAULT 0,
    "hoist" BOOLEAN NOT NULL DEFAULT false,
    "iconUrl" TEXT,
    "unicodeEmoji" TEXT,
    "position" INTEGER NOT NULL,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "managed" BOOLEAN NOT NULL DEFAULT false,
    "mentionable" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRole" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "MemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerBan" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "bannedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerBan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerInvite" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT,
    "createdById" TEXT NOT NULL,
    "targetUserId" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "temporary" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelCategory" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChannelCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "serverId" TEXT,
    "categoryId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "topic" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isNsfw" BOOLEAN NOT NULL DEFAULT false,
    "slowModeDelay" INTEGER NOT NULL DEFAULT 0,
    "lastMessageId" TEXT,
    "lastPinAt" TIMESTAMP(3),
    "bitrate" INTEGER NOT NULL DEFAULT 64000,
    "userLimit" INTEGER NOT NULL DEFAULT 0,
    "rtcRegion" TEXT,
    "videoQualityMode" "VideoQualityMode" NOT NULL DEFAULT 'AUTO',
    "rateLimitPerUser" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archiveTimestamp" TIMESTAMP(3),
    "autoArchiveDuration" INTEGER NOT NULL DEFAULT 1440,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelPermissionOverride" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetType" "PermissionTargetType" NOT NULL,
    "allow" BIGINT NOT NULL DEFAULT 0,
    "deny" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ChannelPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'DEFAULT',
    "replyToId" TEXT,
    "threadParentId" TEXT,
    "threadId" TEXT,
    "alsoSentToChannel" BOOLEAN NOT NULL DEFAULT false,
    "mentionEveryone" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "pinnedById" TEXT,
    "flags" INTEGER NOT NULL DEFAULT 0,
    "forwardedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "placeholderRemovedAt" TIMESTAMP(3),
    "placeholderExpiresAt" TIMESTAMP(3),
    "tts" BOOLEAN NOT NULL DEFAULT false,
    "webhookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_search" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "dmMessageId" TEXT,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "waveform" TEXT,
    "thumbnailUrl" TEXT,
    "scanStatus" "AttachmentScanStatus" NOT NULL DEFAULT 'PENDING',
    "spoiler" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileMediaUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" "MobileMediaUploadPurpose" NOT NULL,
    "targetServerId" TEXT,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "cleanupAfter" TIMESTAMP(3),
    "cleanupLastAttemptAt" TIMESTAMP(3),
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "storageDeletedAt" TIMESTAMP(3),

    CONSTRAINT "MobileMediaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "emojiName" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelReadState" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "lastReadMessageId" TEXT,
    "mentionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChannelReadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserChannelSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "messageNotifications" "MessageNotification" NOT NULL DEFAULT 'DEFAULT',
    "mobilePush" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserChannelSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserServerSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "mutedUntil" TIMESTAMP(3),
    "messageNotifications" "MessageNotification" NOT NULL DEFAULT 'DEFAULT',
    "mobilePush" BOOLEAN NOT NULL DEFAULT true,
    "suppressEveryone" BOOLEAN NOT NULL DEFAULT false,
    "suppressRoles" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserServerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMConversation" (
    "id" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'DM',
    "name" TEXT,
    "iconUrl" TEXT,
    "ownerId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DMParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "threadParentId" TEXT,
    "forwardedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "placeholderRemovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_search" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED,

    CONSTRAINT "DMMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "emojiName" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "dedupeKey" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobilePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenFingerprint" TEXT NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxJob" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationCampaign" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "actionUrl" TEXT,
    "segment" JSONB,
    "status" "NotificationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Emoji" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Emoji_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetId" TEXT,
    "targetType" "AuditLogTargetType",
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deaf" BOOLEAN NOT NULL DEFAULT false,
    "mute" BOOLEAN NOT NULL DEFAULT false,
    "selfDeaf" BOOLEAN NOT NULL DEFAULT false,
    "selfMute" BOOLEAN NOT NULL DEFAULT false,
    "selfStream" BOOLEAN NOT NULL DEFAULT false,
    "selfVideo" BOOLEAN NOT NULL DEFAULT false,
    "suppress" BOOLEAN NOT NULL DEFAULT false,
    "requestToSpeakAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledEvent" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3),
    "status" "ScheduledEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "entityType" "ScheduledEventEntityType" NOT NULL,
    "externalLocation" TEXT,
    "interestedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_premiumType_idx" ON "User"("premiumType");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminMembership_userId_key" ON "AdminMembership"("userId");

-- CreateIndex
CREATE INDEX "AdminMembership_role_idx" ON "AdminMembership"("role");

-- CreateIndex
CREATE INDEX "AdminMembership_grantedById_idx" ON "AdminMembership"("grantedById");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminUserId_createdAt_idx" ON "AdminAuditLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSession_sessionKey_key" ON "AppSession"("sessionKey");

-- CreateIndex
CREATE INDEX "AppSession_userId_startedAt_idx" ON "AppSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "AppSession_lastSeenAt_idx" ON "AppSession"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AppSession_clientType_idx" ON "AppSession"("clientType");

-- CreateIndex
CREATE INDEX "AppSession_countryCode_idx" ON "AppSession"("countryCode");

-- CreateIndex
CREATE INDEX "UserDailyMetric_date_idx" ON "UserDailyMetric"("date");

-- CreateIndex
CREATE INDEX "UserDailyMetric_userId_date_idx" ON "UserDailyMetric"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyMetric_date_userId_key" ON "UserDailyMetric"("date", "userId");

-- CreateIndex
CREATE INDEX "MediaUsageSession_userId_startedAt_idx" ON "MediaUsageSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "MediaUsageSession_serverId_channelId_startedAt_idx" ON "MediaUsageSession"("serverId", "channelId", "startedAt");

-- CreateIndex
CREATE INDEX "MediaUsageSession_sessionId_kind_endedAt_idx" ON "MediaUsageSession"("sessionId", "kind", "endedAt");

-- CreateIndex
CREATE INDEX "MediaUsageSession_kind_startedAt_idx" ON "MediaUsageSession"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_provider_account_id_key" ON "Account"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationSettings_userId_key" ON "UserNotificationSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refresh_token_key" ON "Session"("refresh_token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_refresh_token_idx" ON "Session"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountReauthChallenge_tokenHash_key" ON "AccountReauthChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountReauthChallenge_userId_purpose_usedAt_idx" ON "AccountReauthChallenge"("userId", "purpose", "usedAt");

-- CreateIndex
CREATE INDEX "AccountReauthChallenge_expiresAt_idx" ON "AccountReauthChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorRecoveryCode_codeHash_key" ON "TwoFactorRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "TwoFactorRecoveryCode_userId_usedAt_idx" ON "TwoFactorRecoveryCode"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "UserReport_subjectId_createdAt_idx" ON "UserReport"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "UserReport_reporterId_createdAt_idx" ON "UserReport"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "UserNote_authorId_idx" ON "UserNote"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNote_authorId_subjectId_key" ON "UserNote"("authorId", "subjectId");

-- CreateIndex
CREATE INDEX "FriendRequest_receiverId_idx" ON "FriendRequest"("receiverId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequest_senderId_receiverId_key" ON "FriendRequest"("senderId", "receiverId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_invite_code_key" ON "Server"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "Server_vanity_url_code_key" ON "Server"("vanity_url_code");

-- CreateIndex
CREATE INDEX "Server_name_idx" ON "Server"("name");

-- CreateIndex
CREATE INDEX "Server_invite_code_idx" ON "Server"("invite_code");

-- CreateIndex
CREATE INDEX "Server_ownerId_idx" ON "Server"("ownerId");

-- CreateIndex
CREATE INDEX "Server_discoverable_idx" ON "Server"("discoverable");

-- CreateIndex
CREATE INDEX "ServerMember_serverId_userId_idx" ON "ServerMember"("serverId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerMember_userId_serverId_key" ON "ServerMember"("userId", "serverId");

-- CreateIndex
CREATE INDEX "Role_serverId_idx" ON "Role"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberRole_memberId_roleId_key" ON "MemberRole"("memberId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerBan_serverId_userId_key" ON "ServerBan"("serverId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerInvite_code_key" ON "ServerInvite"("code");

-- CreateIndex
CREATE INDEX "ServerInvite_serverId_idx" ON "ServerInvite"("serverId");

-- CreateIndex
CREATE INDEX "ServerInvite_code_idx" ON "ServerInvite"("code");

-- CreateIndex
CREATE INDEX "ChannelCategory_serverId_idx" ON "ChannelCategory"("serverId");

-- CreateIndex
CREATE INDEX "Channel_serverId_idx" ON "Channel"("serverId");

-- CreateIndex
CREATE INDEX "Channel_serverId_type_idx" ON "Channel"("serverId", "type");

-- CreateIndex
CREATE INDEX "Channel_type_idx" ON "Channel"("type");

-- CreateIndex
CREATE INDEX "Channel_name_idx" ON "Channel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPermissionOverride_channelId_targetId_targetType_key" ON "ChannelPermissionOverride"("channelId", "targetId", "targetType");

-- CreateIndex
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_channelId_alsoSentToChannel_createdAt_idx" ON "Message"("channelId", "alsoSentToChannel", "createdAt");

-- CreateIndex
CREATE INDEX "Message_channelId_threadParentId_createdAt_idx" ON "Message"("channelId", "threadParentId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_channelId_threadId_createdAt_idx" ON "Message"("channelId", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_channelId_placeholderRemovedAt_idx" ON "Message"("channelId", "placeholderRemovedAt");

-- CreateIndex
CREATE INDEX "Message_channelId_placeholderRemovedAt_placeholderExpiresAt_idx" ON "Message"("channelId", "placeholderRemovedAt", "placeholderExpiresAt");

-- CreateIndex
CREATE INDEX "Message_threadParentId_createdAt_idx" ON "Message"("threadParentId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_userId_idx" ON "Message"("userId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX "Attachment_dmMessageId_idx" ON "Attachment"("dmMessageId");

-- CreateIndex
CREATE INDEX "Attachment_scanStatus_idx" ON "Attachment"("scanStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MobileMediaUpload_storageKey_key" ON "MobileMediaUpload"("storageKey");

-- CreateIndex
CREATE INDEX "MobileMediaUpload_ownerId_purpose_targetServerId_idx" ON "MobileMediaUpload"("ownerId", "purpose", "targetServerId");

-- CreateIndex
CREATE INDEX "MobileMediaUpload_expiresAt_claimedAt_idx" ON "MobileMediaUpload"("expiresAt", "claimedAt");

-- CreateIndex
CREATE INDEX "MobileMediaUpload_cleanupAfter_storageDeletedAt_idx" ON "MobileMediaUpload"("cleanupAfter", "storageDeletedAt");

-- CreateIndex
CREATE INDEX "MessageMention_userId_idx" ON "MessageMention"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageMention_messageId_userId_key" ON "MessageMention"("messageId", "userId");

-- CreateIndex
CREATE INDEX "Reaction_messageId_idx" ON "Reaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_messageId_userId_emoji_key" ON "Reaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "PinnedMessage_channelId_pinnedAt_idx" ON "PinnedMessage"("channelId", "pinnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedMessage_channelId_messageId_key" ON "PinnedMessage"("channelId", "messageId");

-- CreateIndex
CREATE INDEX "ChannelReadState_userId_channelId_lastReadAt_idx" ON "ChannelReadState"("userId", "channelId", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelReadState_channelId_userId_key" ON "ChannelReadState"("channelId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserChannelSettings_userId_channelId_key" ON "UserChannelSettings"("userId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "UserServerSettings_userId_serverId_key" ON "UserServerSettings"("userId", "serverId");

-- CreateIndex
CREATE INDEX "DMConversation_ownerId_idx" ON "DMConversation"("ownerId");

-- CreateIndex
CREATE INDEX "DMConversation_lastMessageAt_idx" ON "DMConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "DMParticipant_userId_hiddenAt_idx" ON "DMParticipant"("userId", "hiddenAt");

-- CreateIndex
CREATE UNIQUE INDEX "DMParticipant_conversationId_userId_key" ON "DMParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "DMMessage_conversationId_createdAt_idx" ON "DMMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "DMMessage_conversationId_threadParentId_createdAt_idx" ON "DMMessage"("conversationId", "threadParentId", "createdAt");

-- CreateIndex
CREATE INDEX "DMMessage_conversationId_placeholderRemovedAt_idx" ON "DMMessage"("conversationId", "placeholderRemovedAt");

-- CreateIndex
CREATE INDEX "DMMessage_threadParentId_createdAt_idx" ON "DMMessage"("threadParentId", "createdAt");

-- CreateIndex
CREATE INDEX "DMMessage_userId_idx" ON "DMMessage"("userId");

-- CreateIndex
CREATE INDEX "DMReaction_messageId_idx" ON "DMReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "DMReaction_messageId_userId_emoji_key" ON "DMReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_campaignId_idx" ON "Notification"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushToken_sessionKey_key" ON "MobilePushToken"("sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushToken_token_key" ON "MobilePushToken"("token");

-- CreateIndex
CREATE INDEX "MobilePushToken_userId_idx" ON "MobilePushToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxJob_idempotencyKey_key" ON "OutboxJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutboxJob_status_availableAt_createdAt_idx" ON "OutboxJob"("status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxJob_status_updatedAt_idx" ON "OutboxJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "OutboxJob_type_status_idx" ON "OutboxJob"("type", "status");

-- CreateIndex
CREATE INDEX "OutboxJob_lockedAt_idx" ON "OutboxJob"("lockedAt");

-- CreateIndex
CREATE INDEX "NotificationCampaign_status_createdAt_idx" ON "NotificationCampaign"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationCampaign_createdById_idx" ON "NotificationCampaign"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_name_key" ON "Contributor"("name");

-- CreateIndex
CREATE INDEX "Contributor_name_idx" ON "Contributor"("name");

-- CreateIndex
CREATE INDEX "Emoji_serverId_idx" ON "Emoji"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Webhook_token_key" ON "Webhook"("token");

-- CreateIndex
CREATE INDEX "Webhook_channelId_idx" ON "Webhook"("channelId");

-- CreateIndex
CREATE INDEX "Webhook_serverId_idx" ON "Webhook"("serverId");

-- CreateIndex
CREATE INDEX "AuditLog_serverId_createdAt_idx" ON "AuditLog"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceState_userId_key" ON "VoiceState"("userId");

-- CreateIndex
CREATE INDEX "VoiceState_channelId_idx" ON "VoiceState"("channelId");

-- CreateIndex
CREATE INDEX "VoiceState_serverId_idx" ON "VoiceState"("serverId");

-- CreateIndex
CREATE INDEX "VoiceState_lastHeartbeat_idx" ON "VoiceState"("lastHeartbeat");

-- CreateIndex
CREATE INDEX "VoiceState_serverId_lastHeartbeat_idx" ON "VoiceState"("serverId", "lastHeartbeat");

-- CreateIndex
CREATE INDEX "ScheduledEvent_serverId_idx" ON "ScheduledEvent"("serverId");

-- CreateIndex
CREATE INDEX "ScheduledEvent_scheduledStartAt_idx" ON "ScheduledEvent"("scheduledStartAt");

-- AddForeignKey
ALTER TABLE "AdminMembership" ADD CONSTRAINT "AdminMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMembership" ADD CONSTRAINT "AdminMembership_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDailyMetric" ADD CONSTRAINT "UserDailyMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUsageSession" ADD CONSTRAINT "MediaUsageSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUsageSession" ADD CONSTRAINT "MediaUsageSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUsageSession" ADD CONSTRAINT "MediaUsageSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationSettings" ADD CONSTRAINT "UserNotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReauthChallenge" ADD CONSTRAINT "AccountReauthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorRecoveryCode" ADD CONSTRAINT "TwoFactorRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMember" ADD CONSTRAINT "ServerMember_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ServerMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRole" ADD CONSTRAINT "MemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerBan" ADD CONSTRAINT "ServerBan_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerBan" ADD CONSTRAINT "ServerBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerBan" ADD CONSTRAINT "ServerBan_bannedById_fkey" FOREIGN KEY ("bannedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerInvite" ADD CONSTRAINT "ServerInvite_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerInvite" ADD CONSTRAINT "ServerInvite_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerInvite" ADD CONSTRAINT "ServerInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelCategory" ADD CONSTRAINT "ChannelCategory_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ChannelCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelPermissionOverride" ADD CONSTRAINT "ChannelPermissionOverride_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadParentId_fkey" FOREIGN KEY ("threadParentId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_dmMessageId_fkey" FOREIGN KEY ("dmMessageId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChannelSettings" ADD CONSTRAINT "UserChannelSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChannelSettings" ADD CONSTRAINT "UserChannelSettings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserServerSettings" ADD CONSTRAINT "UserServerSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserServerSettings" ADD CONSTRAINT "UserServerSettings_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMParticipant" ADD CONSTRAINT "DMParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DMConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMParticipant" ADD CONSTRAINT "DMParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DMConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "DMMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMMessage" ADD CONSTRAINT "DMMessage_threadParentId_fkey" FOREIGN KEY ("threadParentId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMReaction" ADD CONSTRAINT "DMReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMReaction" ADD CONSTRAINT "DMReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilePushToken" ADD CONSTRAINT "MobilePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationCampaign" ADD CONSTRAINT "NotificationCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emoji" ADD CONSTRAINT "Emoji_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emoji" ADD CONSTRAINT "Emoji_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceState" ADD CONSTRAINT "VoiceState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceState" ADD CONSTRAINT "VoiceState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceState" ADD CONSTRAINT "VoiceState_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledEvent" ADD CONSTRAINT "ScheduledEvent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledEvent" ADD CONSTRAINT "ScheduledEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledEvent" ADD CONSTRAINT "ScheduledEvent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Raw PostgreSQL objects intentionally retained from the historical migration chain.
-- Prisma models the tsvector columns as Unsupported and cannot declare the generated expressions or partial indexes.
CREATE INDEX IF NOT EXISTS message_content_search_idx
ON "Message" USING GIN (content_search);

CREATE INDEX IF NOT EXISTS dm_message_content_search_idx
ON "DMMessage" USING GIN (content_search);

CREATE INDEX IF NOT EXISTS message_reply_to_idx
ON "Message" ("replyToId")
WHERE "replyToId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS message_thread_id_idx
ON "Message" ("threadId")
WHERE "threadId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS channel_parent_id_idx
ON "Channel" ("parentId")
WHERE "parentId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS channel_archived_idx
ON "Channel" ("archived");

CREATE INDEX IF NOT EXISTS notification_unread_idx
ON "Notification" ("userId", "read")
WHERE "read" = false;

CREATE INDEX IF NOT EXISTS server_invite_uses_idx
ON "ServerInvite" ("uses")
WHERE "uses" > 0;

CREATE INDEX IF NOT EXISTS server_member_joined_at_idx
ON "ServerMember" ("serverId", "joinedAt");

CREATE INDEX IF NOT EXISTS channel_last_message_id_idx
ON "Channel" ("lastMessageId")
WHERE "lastMessageId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS attachment_size_idx
ON "Attachment" ("size")
WHERE "size" > 0;

CREATE INDEX IF NOT EXISTS server_ban_created_at_idx
ON "ServerBan" ("serverId", "createdAt");

CREATE INDEX IF NOT EXISTS scheduled_event_start_at_idx
ON "ScheduledEvent" ("scheduledStartAt")
WHERE "status" = 'SCHEDULED';

-- Prisma does not model PostgreSQL CHECK constraints.
ALTER TABLE "MobileMediaUpload"
ADD CONSTRAINT "MobileMediaUpload_purpose_target_check"
CHECK (
  ("purpose" IN ('PROFILE_AVATAR', 'PROFILE_BANNER') AND "targetServerId" IS NULL)
  OR ("purpose" = 'SERVER_ICON' AND "targetServerId" IS NOT NULL)
);
