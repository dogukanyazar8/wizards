-- AlterTable
ALTER TABLE "Message" ADD COLUMN "forwardedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DMMessage" ADD COLUMN "forwardedAt" TIMESTAMP(3);
