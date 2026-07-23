-- CreateTable
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "body" VARCHAR(256) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

-- One note per (author, subject): saving replaces the row, clearing deletes it,
-- so the upsert path needs a unique target rather than a scan.
CREATE UNIQUE INDEX "UserNote_authorId_subjectId_key" ON "UserNote"("authorId", "subjectId");

-- Every read is scoped to the author. There is deliberately no subject-only
-- index: nothing may enumerate the notes written about a person.
CREATE INDEX "UserNote_authorId_idx" ON "UserNote"("authorId");

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
