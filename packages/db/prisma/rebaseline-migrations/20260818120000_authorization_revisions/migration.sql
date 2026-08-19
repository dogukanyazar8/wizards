ALTER TABLE "Server"
ADD COLUMN "authorizationRevision" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "ServerAuthorizationSubjectRevision" (
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerAuthorizationSubjectRevision_pkey" PRIMARY KEY ("serverId", "userId")
);

CREATE INDEX "ServerAuthorizationSubjectRevision_userId_idx"
ON "ServerAuthorizationSubjectRevision"("userId");

ALTER TABLE "ServerAuthorizationSubjectRevision"
ADD CONSTRAINT "ServerAuthorizationSubjectRevision_serverId_fkey"
FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServerAuthorizationSubjectRevision"
ADD CONSTRAINT "ServerAuthorizationSubjectRevision_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
