CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'SUPPORT', 'ANALYST', 'MODERATOR');

CREATE TYPE "AnalyticsClientType" AS ENUM ('WEB', 'DESKTOP', 'MOBILE', 'UNKNOWN');

CREATE TYPE "AnalyticsDeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN');

CREATE TYPE "AnalyticsMediaKind" AS ENUM ('VOICE', 'CAMERA', 'SCREEN_SHARE');

CREATE TYPE "NotificationCampaignStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

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

ALTER TABLE "Notification" ADD COLUMN "campaignId" TEXT;

CREATE UNIQUE INDEX "AdminMembership_userId_key" ON "AdminMembership"("userId");
CREATE INDEX "AdminMembership_role_idx" ON "AdminMembership"("role");
CREATE INDEX "AdminMembership_grantedById_idx" ON "AdminMembership"("grantedById");

CREATE INDEX "AdminAuditLog_adminUserId_createdAt_idx" ON "AdminAuditLog"("adminUserId", "createdAt");
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

CREATE UNIQUE INDEX "AppSession_sessionKey_key" ON "AppSession"("sessionKey");
CREATE INDEX "AppSession_userId_startedAt_idx" ON "AppSession"("userId", "startedAt");
CREATE INDEX "AppSession_lastSeenAt_idx" ON "AppSession"("lastSeenAt");
CREATE INDEX "AppSession_clientType_idx" ON "AppSession"("clientType");
CREATE INDEX "AppSession_countryCode_idx" ON "AppSession"("countryCode");

CREATE UNIQUE INDEX "UserDailyMetric_date_userId_key" ON "UserDailyMetric"("date", "userId");
CREATE INDEX "UserDailyMetric_date_idx" ON "UserDailyMetric"("date");
CREATE INDEX "UserDailyMetric_userId_date_idx" ON "UserDailyMetric"("userId", "date");

CREATE INDEX "MediaUsageSession_userId_startedAt_idx" ON "MediaUsageSession"("userId", "startedAt");
CREATE INDEX "MediaUsageSession_serverId_channelId_startedAt_idx" ON "MediaUsageSession"("serverId", "channelId", "startedAt");
CREATE INDEX "MediaUsageSession_sessionId_kind_endedAt_idx" ON "MediaUsageSession"("sessionId", "kind", "endedAt");
CREATE INDEX "MediaUsageSession_kind_startedAt_idx" ON "MediaUsageSession"("kind", "startedAt");

CREATE INDEX "NotificationCampaign_status_createdAt_idx" ON "NotificationCampaign"("status", "createdAt");
CREATE INDEX "NotificationCampaign_createdById_idx" ON "NotificationCampaign"("createdById");
CREATE INDEX "Notification_campaignId_idx" ON "Notification"("campaignId");

ALTER TABLE "AdminMembership" ADD CONSTRAINT "AdminMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminMembership" ADD CONSTRAINT "AdminMembership_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDailyMetric" ADD CONSTRAINT "UserDailyMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaUsageSession" ADD CONSTRAINT "MediaUsageSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaUsageSession" ADD CONSTRAINT "MediaUsageSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaUsageSession" ADD CONSTRAINT "MediaUsageSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationCampaign" ADD CONSTRAINT "NotificationCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
