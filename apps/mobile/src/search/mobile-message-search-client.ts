import {
  MessageSearchResponseSchema,
  type MessageSearchResponse,
} from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT = 20;
export const MOBILE_MESSAGE_SEARCH_MAX_LIMIT = 25;
export const MOBILE_MESSAGE_SEARCH_MAX_QUERY_LENGTH = 120;
export const MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH = 2;

export type MobileMessageSearchScope = "channel" | "dm";

export type MobileMessageSearchInput = {
  author?: string | null;
  conversationId: string;
  cursor?: string | null;
  exact?: boolean | null;
  from?: string | null;
  limit?: number | null;
  query: string;
  scope: MobileMessageSearchScope;
  to?: string | null;
};

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSearchLimit(value: number | null | undefined) {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return MOBILE_MESSAGE_SEARCH_DEFAULT_LIMIT;
  }

  return Math.min(
    Math.max(Math.trunc(value!), 1),
    MOBILE_MESSAGE_SEARCH_MAX_LIMIT,
  );
}

function appendOptionalSearchParam(
  params: URLSearchParams,
  key: string,
  value: string | null | undefined,
) {
  const normalized = typeof value === "string" ? normalizeSearchText(value) : "";

  if (normalized.length > 0) {
    params.set(key, normalized);
  }
}

export function buildMobileMessageSearchPath(input: MobileMessageSearchInput): string {
  const conversationId = normalizeSearchText(input.conversationId);
  if (conversationId.length === 0) {
    throw new Error("Mobile message search requires a conversation id.");
  }

  const query = normalizeSearchText(input.query);
  if (query.length < MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH) {
    throw new Error("Mobile message search requires at least 2 characters.");
  }

  if (query.length > MOBILE_MESSAGE_SEARCH_MAX_QUERY_LENGTH) {
    throw new Error("Mobile message search query is too long.");
  }

  const author = typeof input.author === "string" ? normalizeSearchText(input.author) : "";
  if (author.length > 80) {
    throw new Error("Mobile message search author filter is too long.");
  }

  const params = new URLSearchParams({
    limit: String(normalizeSearchLimit(input.limit)),
    q: query,
  });

  appendOptionalSearchParam(params, "author", author);
  appendOptionalSearchParam(params, "cursor", input.cursor);
  appendOptionalSearchParam(params, "from", input.from);
  appendOptionalSearchParam(params, "to", input.to);

  if (input.exact === true) {
    params.set("exact", "true");
  }

  const encodedConversationId = encodeURIComponent(conversationId);
  const basePath =
    input.scope === "channel"
      ? `/api/v1/mobile/channels/${encodedConversationId}/messages/search`
      : `/api/v1/mobile/dm/${encodedConversationId}/messages/search`;

  return `${basePath}?${params.toString()}`;
}

export async function searchMobileMessages(
  client: MobileApiClient,
  input: MobileMessageSearchInput,
): Promise<MessageSearchResponse> {
  const payload = await client.requestJson<unknown>(buildMobileMessageSearchPath(input));
  return MessageSearchResponseSchema.parse(payload);
}

export function validateMobileMessageSearchContract(): string[] {
  const issues: string[] = [];

  try {
    const path = buildMobileMessageSearchPath({
      conversationId: "channel/one",
      limit: 100,
      query: " release notes ",
      scope: "channel",
    });

    if (!path.startsWith("/api/v1/mobile/channels/channel%2Fone/messages/search?")) {
      issues.push("Mobile channel search must use the authenticated mobile route.");
    }

    if (!path.includes("limit=25") || !path.includes("q=release+notes")) {
      issues.push("Mobile channel search must normalize query text and clamp limits.");
    }
  } catch (error) {
    issues.push(
      `Mobile channel search contract failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  try {
    const path = buildMobileMessageSearchPath({
      conversationId: "dm 1",
      exact: true,
      query: "hello",
      scope: "dm",
    });

    if (!path.startsWith("/api/v1/mobile/dm/dm%201/messages/search?")) {
      issues.push("Mobile DM search must use the authenticated mobile route.");
    }

    if (!path.includes("exact=true")) {
      issues.push("Mobile DM search must preserve exact search intent.");
    }
  } catch (error) {
    issues.push(
      `Mobile DM search contract failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  try {
    buildMobileMessageSearchPath({
      conversationId: "conversation-1",
      query: "x",
      scope: "dm",
    });
    issues.push("Mobile message search must reject one-character queries.");
  } catch {
    // Expected.
  }

  return issues;
}
