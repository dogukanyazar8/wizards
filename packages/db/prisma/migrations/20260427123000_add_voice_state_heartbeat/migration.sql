ALTER TABLE "VoiceState"
ADD COLUMN "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "VoiceState_serverId_lastHeartbeat_idx"
ON "VoiceState"("serverId", "lastHeartbeat");
