import { MOBILE_USER_NOTE_MAX_LENGTH, MobileUserNoteResponseSchema } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export { MOBILE_USER_NOTE_MAX_LENGTH };

/**
 * Notes are trimmed, never padded: a sheet the user cleared and one they filled
 * with spaces both mean "delete this note", and both send an empty body.
 */
export function normalizeMobileUserNote(value: string): string {
  return value.trim().slice(0, MOBILE_USER_NOTE_MAX_LENGTH);
}

/** A cleared note is stored as `null`, so callers never have to distinguish "" from absent. */
function toStoredNote(value: string): string | null {
  const normalized = normalizeMobileUserNote(value);
  return normalized.length === 0 ? null : normalized;
}

/**
 * Writes the viewer's private note about another user. The note is only ever
 * readable by its author, so the subject id is a path parameter and the author
 * comes from the session — the client cannot address someone else's note.
 *
 * Empty body deletes: the 2b sheet has no separate delete affordance, clearing
 * the field and saving is the delete.
 */
export async function saveMobileUserNote(
  client: MobileApiClient,
  userId: string,
  body: string,
): Promise<string | null> {
  const response = MobileUserNoteResponseSchema.parse(
    await client.requestJson(`/api/v1/mobile/users/${encodeURIComponent(userId)}/note`, {
      body: { body: toStoredNote(body) },
      method: "PUT",
    }),
  );

  return response.note;
}
