CREATE TABLE "EmailChangeChallenge" (
    "userId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "currentEmail" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "credentialStamp" TEXT NOT NULL,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "oauthTokenHash" TEXT,
    "oauthVerifiedAt" TIMESTAMP(3),
    CONSTRAINT "EmailChangeChallenge_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "EmailChangeChallenge_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 5)
);
CREATE UNIQUE INDEX "EmailChangeChallenge_id_key" ON "EmailChangeChallenge"("id");
CREATE UNIQUE INDEX "EmailChangeChallenge_oauthTokenHash_key" ON "EmailChangeChallenge"("oauthTokenHash");
CREATE INDEX "EmailChangeChallenge_expiresAt_idx" ON "EmailChangeChallenge"("expiresAt");
ALTER TABLE "EmailChangeChallenge" ADD CONSTRAINT "EmailChangeChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
