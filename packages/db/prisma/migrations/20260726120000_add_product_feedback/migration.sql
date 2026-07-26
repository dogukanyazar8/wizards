-- Feedback status changes get their own notification type so the mobile tap
-- handler can route straight to the tracking view instead of sniffing metadata,
-- and so product updates stay separable from SYSTEM security notices.
ALTER TYPE "NotificationType" ADD VALUE 'FEEDBACK';

-- 4a screenshots ride the existing mobile media upload lifecycle.
ALTER TYPE "MobileMediaUploadPurpose" ADD VALUE 'FEEDBACK_ATTACHMENT';

-- CreateEnum
CREATE TYPE "FeedbackRating" AS ENUM ('BAD', 'OKAY', 'GOOD', 'GREAT');

-- CreateEnum
CREATE TYPE "FeedbackTopic" AS ENUM ('SUGGESTION', 'BUG', 'VOICE', 'PERFORMANCE', 'OTHER');

-- Shared by Feedback and RoadmapItem: a linked pair always reads the same
-- status, so the roadmap row and the submitter's tracking card cannot disagree.
CREATE TYPE "FeedbackStatus" AS ENUM ('REVIEWING', 'PLANNED', 'IN_PROGRESS', 'SHIPPED');

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "status" "FeedbackStatus" NOT NULL DEFAULT 'REVIEWING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "publicNumber" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "FeedbackRating" NOT NULL,
    "topic" "FeedbackTopic" NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "diagnostics" JSONB,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'REVIEWING',
    "roadmapItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "statusChangedAt" TIMESTAMP(3),

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapVote" (
    "id" TEXT NOT NULL,
    "roadmapItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapVote_pkey" PRIMARY KEY ("id")
);

-- The number the UI renders as WSP-{n}; users quote it, support searches it.
CREATE UNIQUE INDEX "Feedback_publicNumber_key" ON "Feedback"("publicNumber");

-- One upload can back at most one attachment, which is what stops a replayed
-- claim id from smuggling the same screenshot onto a second submission.
CREATE UNIQUE INDEX "FeedbackAttachment_uploadId_key" ON "FeedbackAttachment"("uploadId");

-- Votes are one per person per item, so the toggle is an insert/delete rather
-- than a counter the client can drift.
CREATE UNIQUE INDEX "RoadmapVote_roadmapItemId_userId_key" ON "RoadmapVote"("roadmapItemId", "userId");

-- The console lists newest-first inside a status/topic filter; the mobile
-- tracking view reads one user's own history.
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
CREATE INDEX "Feedback_topic_createdAt_idx" ON "Feedback"("topic", "createdAt");
CREATE INDEX "Feedback_roadmapItemId_idx" ON "Feedback"("roadmapItemId");
CREATE INDEX "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");
CREATE INDEX "RoadmapItem_status_position_idx" ON "RoadmapItem"("status", "position");
CREATE INDEX "RoadmapItem_featured_position_idx" ON "RoadmapItem"("featured", "position");
CREATE INDEX "RoadmapVote_userId_idx" ON "RoadmapVote"("userId");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A retired roadmap item must not take the feedback that fed it, so the link
-- clears instead of cascading.
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_roadmapItemId_fkey" FOREIGN KEY ("roadmapItemId") REFERENCES "RoadmapItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapVote" ADD CONSTRAINT "RoadmapVote_roadmapItemId_fkey" FOREIGN KEY ("roadmapItemId") REFERENCES "RoadmapItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapVote" ADD CONSTRAINT "RoadmapVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
