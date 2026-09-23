import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

/**
 * 11e private notes (handoff 2b). Every function here is scoped by `authorId`,
 * and none of them accepts a subject-only lookup: the note is invisible to the
 * person it is about, and a query shape that could enumerate notes by subject
 * would be the one way that guarantee could leak.
 */

export interface MobileUserNoteScope {
  readonly authorId: string;
  readonly subjectId: string;
}

async function assertSubjectExists(subjectId: string): Promise<void> {
  const subject = await prisma.user.findFirst({
    select: { id: true },
    where: { deletedAt: null, id: subjectId },
  });

  if (!subject) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }
}

/** The viewer's own note about someone, or null when they have not written one. */
export async function getMobileUserNote(scope: MobileUserNoteScope): Promise<string | null> {
  const note = await prisma.userNote.findUnique({
    select: { body: true },
    where: { authorId_subjectId: { authorId: scope.authorId, subjectId: scope.subjectId } },
  });

  return note?.body ?? null;
}

/**
 * Saves or clears the viewer's note. A null body deletes the row rather than
 * storing an empty string, so "no note" has exactly one representation and the
 * 1c card never has to tell them apart.
 *
 * Writing a note about yourself is refused: your own card shows no note field,
 * so a request for one is a client bug, not a user intent.
 */
export async function saveMobileUserNote(
  scope: MobileUserNoteScope,
  body: string | null,
): Promise<{ note: string | null }> {
  if (scope.authorId === scope.subjectId) {
    throw new ApiError("Cannot write a note about yourself", 400, "NOTE_SELF_TARGET");
  }

  await assertSubjectExists(scope.subjectId);

  if (body === null) {
    await prisma.userNote.deleteMany({
      where: { authorId: scope.authorId, subjectId: scope.subjectId },
    });
    return { note: null };
  }

  const saved = await prisma.userNote.upsert({
    create: { authorId: scope.authorId, body, subjectId: scope.subjectId },
    select: { body: true },
    update: { body },
    where: { authorId_subjectId: { authorId: scope.authorId, subjectId: scope.subjectId } },
  });

  return { note: saved.body };
}
