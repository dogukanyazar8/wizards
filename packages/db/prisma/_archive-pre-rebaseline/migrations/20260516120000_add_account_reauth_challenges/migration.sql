-- CreateTable
CREATE TABLE "AccountReauthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" VARCHAR(64) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountReauthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountReauthChallenge_tokenHash_key" ON "AccountReauthChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountReauthChallenge_userId_purpose_usedAt_idx" ON "AccountReauthChallenge"("userId", "purpose", "usedAt");

-- CreateIndex
CREATE INDEX "AccountReauthChallenge_expiresAt_idx" ON "AccountReauthChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "AccountReauthChallenge" ADD CONSTRAINT "AccountReauthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;