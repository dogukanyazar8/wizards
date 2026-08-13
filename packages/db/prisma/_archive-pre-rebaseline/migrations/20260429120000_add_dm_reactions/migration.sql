-- CreateTable
CREATE TABLE "DMReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "emojiName" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DMReaction_messageId_userId_emoji_key" ON "DMReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "DMReaction_messageId_idx" ON "DMReaction"("messageId");

-- AddForeignKey
ALTER TABLE "DMReaction" ADD CONSTRAINT "DMReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DMReaction" ADD CONSTRAINT "DMReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
