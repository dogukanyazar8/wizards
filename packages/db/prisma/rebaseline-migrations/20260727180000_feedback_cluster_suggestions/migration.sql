-- Clustering only ever proposes. The table holds suggestions an operator
-- accepts or rejects; no existing feedback row is touched by this migration.
CREATE TYPE "ClusterSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "FeedbackClusterSuggestion" (
  "id" TEXT NOT NULL,
  "topic" "FeedbackTopic" NOT NULL,
  "feedbackIds" JSONB NOT NULL,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "ClusterSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedbackClusterSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackClusterSuggestion_status_score_idx" ON "FeedbackClusterSuggestion"("status", "score");

CREATE INDEX "FeedbackClusterSuggestion_topic_createdAt_idx" ON "FeedbackClusterSuggestion"("topic", "createdAt");

ALTER TABLE "FeedbackClusterSuggestion"
  ADD CONSTRAINT "FeedbackClusterSuggestion_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
