-- Server classification: personal servers stay the default, community servers
-- are created only through the admin surface.
CREATE TYPE "ServerType" AS ENUM ('PERSONAL', 'COMMUNITY');

ALTER TABLE "Server" ADD COLUMN "type" "ServerType" NOT NULL DEFAULT 'PERSONAL';

-- Denormalised member counter. The discovery list and the profile card read it
-- directly so neither has to aggregate ServerMember on a hot path.
ALTER TABLE "Server" ADD COLUMN "memberCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Server" s
SET "memberCount" = (
  SELECT COUNT(*) FROM "ServerMember" m WHERE m."serverId" = s."id"
);

CREATE INDEX "Server_type_discoverable_memberCount_idx"
  ON "Server"("type", "discoverable", "memberCount");
