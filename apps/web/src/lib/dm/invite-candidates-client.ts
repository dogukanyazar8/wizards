"use client";

import {
  InviteCandidatePageSchema,
  type InviteCandidateDTO,
  type InviteCandidatePage,
} from "@wizards/types";

import { DMClientError } from "@/lib/dm/client";

/**
 * SPEC-MESAJLAR §16, client side: the query key the add-members modal caches under and
 * the one fetch behind it.
 *
 * A third file rather than more of `lib/dm/client.ts` or `group-profile-client.ts`, for
 * the reason the second one gives: those are the conversation cache and the profile
 * panel's reads, and this list has a different lifetime — it is keyed by the **search
 * term**, so it turns over on every keystroke the debounce lets through.
 *
 * `DMClientError` is reused rather than redeclared so one `catch` still covers every DM
 * request.
 */

export const inviteCandidateQueryKeys = {
  /**
   * Prefix for every search this conversation has run. The modal reads it to look a
   * chip's name up: somebody picked under `"can"` is still a chip after the box is
   * cleared, and their row is only in the page cached under the old term.
   */
  conversation: (conversationId: string) => ["dm", "invite-candidates", conversationId] as const,
  /**
   * The query is part of the key on purpose. React Query then caches each search
   * independently, backspacing to a term already typed paints from cache, and a page
   * fetched for `"can"` can never be appended to the list for `"deniz"` — which is
   * exactly what a single key plus a `cursor` would do when two requests race.
   */
  list: (conversationId: string, query: string) =>
    ["dm", "invite-candidates", conversationId, query] as const,
  root: ["dm", "invite-candidates"] as const,
};

/**
 * Every candidate any cached search for this conversation has already delivered,
 * keyed by id.
 *
 * The add-members modal needs it for two things a single page cannot answer: the chip
 * strip (a picked person whose row the current search hides) and the success toast's
 * `{name}` (the request carries ids, the sentence needs names). Reading the cache
 * rather than accumulating into a ref keeps the lookup derived from state React already
 * owns — a ref written during render is a value the renderer cannot see change.
 */
export function collectCachedInviteCandidates(
  entries: ReadonlyArray<readonly [unknown, { pages: InviteCandidatePage[] } | undefined]>,
): Map<string, InviteCandidateDTO> {
  const byUserId = new Map<string, InviteCandidateDTO>();

  for (const [, data] of entries) {
    for (const page of data?.pages ?? []) {
      for (const item of page.items) {
        byUserId.set(item.userId, item);
      }
    }
  }

  return byUserId;
}

export type FetchInviteCandidatesOptions = {
  readonly cursor?: string | null;
  readonly query?: string | null;
};

/** K16. `cursor` is the opaque token the previous page answered with. */
export async function fetchInviteCandidatesPage(
  conversationId: string,
  options: FetchInviteCandidatesOptions = {},
): Promise<InviteCandidatePage> {
  const url = new URL(
    `/api/v1/dm/groups/${encodeURIComponent(conversationId)}/candidates`,
    window.location.origin,
  );

  if (options.cursor) {
    url.searchParams.set("cursor", options.cursor);
  }

  const query = options.query?.trim();

  if (query) {
    url.searchParams.set("query", query);
  }

  const response = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new DMClientError(payload?.error ?? "Request failed", response.status, payload?.code);
  }

  return InviteCandidatePageSchema.parse(payload);
}
