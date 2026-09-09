"use client";

import {
  GroupMemberPageSchema,
  GroupProfilePanelDTOSchema,
  type GroupMemberPage,
  type GroupProfilePanelDTO,
} from "@wizards/types";

import { DMClientError } from "@/lib/dm/client";

/**
 * SPEC §15's group arm, client side: query keys and the four fetches behind
 * them. Deliberately a second file rather than more of `lib/dm/client.ts` —
 * that module is the 1:1 conversation cache and its helpers, and the profile
 * panel is a different surface with a different lifetime.
 *
 * `DMClientError` is reused rather than redeclared so a caller can keep one
 * `catch` for every DM request.
 */

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new DMClientError(payload?.error ?? "Request failed", response.status, payload?.code);
  }

  return payload as T;
}

/**
 * `members` is keyed separately from `panel` on purpose: §15.2 loads tab bodies
 * lazily, so opening the panel on `Genel` must not fetch the roster, and
 * invalidating the roster after `Üye ekle` must not throw away the identity
 * block that is still on screen.
 */
export const groupProfileQueryKeys = {
  members: (conversationId: string) => ["dm", "group-profile", conversationId, "members"] as const,
  panel: (conversationId: string) => ["dm", "group-profile", conversationId, "panel"] as const,
  root: ["dm", "group-profile"] as const,
};

function toGroupPath(conversationId: string, suffix = ""): string {
  return `/api/v1/dm/groups/${encodeURIComponent(conversationId)}${suffix}`;
}

export async function fetchGroupProfilePanel(
  conversationId: string,
): Promise<GroupProfilePanelDTO> {
  const payload = await requestJson<{ profile: unknown }>(toGroupPath(conversationId, "/profile"));

  return GroupProfilePanelDTOSchema.parse(payload.profile);
}

/** K16. `cursor` is the opaque token the previous page answered with. */
export async function fetchGroupMembersPage(
  conversationId: string,
  cursor?: string | null,
): Promise<GroupMemberPage> {
  const url = new URL(toGroupPath(conversationId, "/members"), window.location.origin);

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  return GroupMemberPageSchema.parse(await requestJson<unknown>(url.toString()));
}

/**
 * §15.5.3. Answers with the instant the floor was raised, which is what the
 * caller needs to know the toast is describing this request and not a stale one.
 */
export async function clearGroupHistoryRequest(
  conversationId: string,
): Promise<{ clearedAt: string }> {
  return await requestJson<{ clearedAt: string }>(toGroupPath(conversationId, "/history"), {
    method: "DELETE",
  });
}

/**
 * §15.5.3. OWNER only — the server decides, so a caller that reached this from a
 * stale panel gets a 403 rather than a deletion.
 */
export async function deleteGroupConversationRequest(conversationId: string): Promise<void> {
  await requestJson<void>(toGroupPath(conversationId), { method: "DELETE" });
}
