CREATE TYPE "AttachmentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');

ALTER TABLE "Attachment"
ADD COLUMN "scanStatus" "AttachmentScanStatus" NOT NULL DEFAULT 'CLEAN';

ALTER TABLE "Attachment"
ALTER COLUMN "scanStatus" SET DEFAULT 'PENDING';

CREATE INDEX "Attachment_scanStatus_idx" ON "Attachment"("scanStatus");
