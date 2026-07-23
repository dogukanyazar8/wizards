-- Banner uploads are owner-scoped like avatars, so they must carry no target server.
ALTER TABLE "MobileMediaUpload" DROP CONSTRAINT "MobileMediaUpload_purpose_target_check";
ALTER TABLE "MobileMediaUpload" ADD CONSTRAINT "MobileMediaUpload_purpose_target_check" CHECK (("purpose" IN ('PROFILE_AVATAR', 'PROFILE_BANNER') AND "targetServerId" IS NULL) OR ("purpose" = 'SERVER_ICON' AND "targetServerId" IS NOT NULL));

-- Null until the first username change, so existing accounts start without a cooldown.
ALTER TABLE "User" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);
