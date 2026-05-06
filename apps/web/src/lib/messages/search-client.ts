import { MessageSearchResponseSchema, type MessageSearchResponse } from "@wizards/types";

type SearchMessagesOptions = {
  author?: string | null;
  conversationId: string;
  cursor?: string | null;
  exact?: boolean;
  from?: string | null;
  limit?: number;
  mode: "channel" | "dm";
  query: string;
  to?: string | null;
};

export const messageSearchQueryKeys = {
  root: ["messages", "search"] as const,
  search: (mode: "channel" | "dm", conversationId: string, query: string) =>
    ["messages", "search", mode, conversationId, query] as const,
};

export async function searchMessages({
  author,
  conversationId,
  cursor,
  exact = false,
  from,
  limit = 20,
  mode,
  query,
  to,
}: SearchMessagesOptions): Promise<MessageSearchResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    q: query,
  });

  if (author?.trim()) {
    params.set("author", author.trim());
  }

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (exact) {
    params.set("exact", "true");
  }

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  const base =
    mode === "channel"
      ? `/api/v1/channels/${conversationId}/messages/search`
      : `/api/v1/dm/${conversationId}/messages/search`;
  const response = await fetch(`${base}?${params.toString()}`);
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Message search failed",
    );
  }

  return MessageSearchResponseSchema.parse(payload);
}
