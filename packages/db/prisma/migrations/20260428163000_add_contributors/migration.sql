-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_name_key" ON "Contributor"("name");

-- CreateIndex
CREATE INDEX "Contributor_name_idx" ON "Contributor"("name");

-- Seed default contributors
INSERT INTO "Contributor" ("id", "name", "createdAt", "updatedAt")
VALUES
  ('contrib-atakan-tuymaz', 'Atakan Tuymaz', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('contrib-muhammet-yildiz', U&'Muhammet Y\0131ld\0131z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('contrib-oguz-gugumcuoglu', U&'O\011Fuz G\00FC\011F\00FCmc\00FCo\011Flu', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
