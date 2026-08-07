-- Group DM system messages. These rows live in DMMessage so they interleave
-- with real messages in one pagination pass; content is always empty because
-- the sentence is localized per viewer on the client.
CREATE TYPE "DMSystemMessageType" AS ENUM (
  'GROUP_CREATED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_LEFT',
  'NAME_CHANGED',
  'ICON_CHANGED'
);

ALTER TABLE "DMMessage"
  ADD COLUMN "systemType" "DMSystemMessageType",
  ADD COLUMN "systemTargetUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "systemValue" VARCHAR(100);
