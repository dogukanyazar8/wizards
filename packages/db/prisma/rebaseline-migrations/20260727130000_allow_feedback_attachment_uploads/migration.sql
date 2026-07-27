-- Feedback attachments are user-owned uploads, like profile images. They must
-- never be associated with a server; only server icons require that target.
ALTER TABLE "MobileMediaUpload"
DROP CONSTRAINT "MobileMediaUpload_purpose_target_check";

ALTER TABLE "MobileMediaUpload"
ADD CONSTRAINT "MobileMediaUpload_purpose_target_check"
CHECK (
  (
    "purpose" IN ('PROFILE_AVATAR', 'PROFILE_BANNER', 'FEEDBACK_ATTACHMENT')
    AND "targetServerId" IS NULL
  )
  OR (
    "purpose" = 'SERVER_ICON'
    AND "targetServerId" IS NOT NULL
  )
) NOT VALID;

ALTER TABLE "MobileMediaUpload"
VALIDATE CONSTRAINT "MobileMediaUpload_purpose_target_check";
