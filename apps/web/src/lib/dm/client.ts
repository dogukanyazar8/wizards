"use client";

import type { InfiniteData } from "@tanstack/react-query";
import {
  DMConversationDTOSchema,
  type DMConversationDTO,
} from "@wizards/types";
import type { FriendPresenceUpdateDto } from "@/lib/friends/types";
import {
  DMConversationsPageResponseSchema,
  DMConversationsResponseSchema,
  DMMessagesResponseSchema,
  DMThreadMessagesResponseSchema,
  DMMutualServersResponseSchema,
  type DMConversationsPageResponse,
  type DMMessagesResponse,
  type DMMutualServersResponse,
  type DMThreadMessagesResponse,
} from "@/lib/dm/types";
import {
  isMessageGifContentType,
  isMessageImageContentType,
} from "@/lib/messages/attachment-rules";

export class DMClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "DMClientError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export const dmQueryKeys = {
  conversation: (conversationId: string) => ["dm", "conversation", conversationId] as const,
  list: ["dm", "conversations"] as const,
  mutualServers: (userId: string) => ["dm", "mutual-servers", userId] as const,
  root: ["dm"] as const,
};

export type DMConversationsInfiniteData = InfiniteData<DMConversationsPageResponse>;

async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...init } = options;
  const requestInit: RequestInit = {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(url, requestInit);
  const payload = (await response.json().catch(() => null)) as
    | {
        code?: string;
        error?: string;
      }
    | null;

  if (!response.ok) {
    throw new DMClientError(payload?.error ?? "Request failed", response.status, payload?.code);
  }

  return payload as T;
}

function sortConversations(conversations: DMConversationDTO[]) {
  return [...conversations].sort(
    (left, right) =>
      new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
  );
}

function withUnreadCount(
  conversation: DMConversationDTO,
  currentUserId: string,
  unreadCount: number,
): DMConversationDTO {
  return {
    ...conversation,
    participants: conversation.participants.map((participant) =>
      participant.userId === currentUserId
        ? {
            ...participant,
            unreadCount,
          }
        : participant,
    ),
  };
}

function withMuted(
  conversation: DMConversationDTO,
  currentUserId: string,
  muted: boolean,
): DMConversationDTO {
  return {
    ...conversation,
    participants: conversation.participants.map((participant) =>
      participant.userId === currentUserId
        ? {
            ...participant,
            muted,
          }
        : participant,
    ),
  };
}

export function upsertDMConversation(
  conversations: DMConversationDTO[] | undefined,
  conversation: DMConversationDTO,
): DMConversationDTO[] {
  const nextConversations = conversations ?? [];
  const withoutCurrent = nextConversations.filter((item) => item.id !== conversation.id);
  return sortConversations([conversation, ...withoutCurrent]);
}

export function createDMConversationsInfiniteData(
  conversations: DMConversationDTO[] = [],
): DMConversationsInfiniteData {
  return {
    pageParams: [undefined],
    pages: [
      {
        conversations: sortConversations(conversations),
        nextCursor: null,
      },
    ],
  };
}

export function flattenDMConversationPages(
  data: DMConversationsInfiniteData | undefined,
): DMConversationDTO[] {
  if (!data) {
    return [];
  }

  const conversationsById = new Map<string, DMConversationDTO>();
  for (const page of data.pages) {
    for (const conversation of page.conversations) {
      conversationsById.set(conversation.id, conversation);
    }
  }

  return sortConversations([...conversationsById.values()]);
}

export function upsertDMConversationPageData(
  data: DMConversationsInfiniteData | undefined,
  conversation: DMConversationDTO,
): DMConversationsInfiniteData {
  if (!data) {
    return createDMConversationsInfiniteData([conversation]);
  }

  const pages = data.pages.map((page, index) => {
    const conversationsWithoutCurrent = page.conversations.filter(
      (item) => item.id !== conversation.id,
    );

    return {
      ...page,
      conversations:
        index === 0
          ? sortConversations([conversation, ...conversationsWithoutCurrent])
          : conversationsWithoutCurrent,
    };
  });

  return {
    ...data,
    pages,
  };
}

export function removeDMConversationFromPageData(
  data: DMConversationsInfiniteData | undefined,
  conversationId: string,
): DMConversationsInfiniteData | undefined {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      ),
    })),
  };
}

export function markDMConversationAsReadInPageData(
  data: DMConversationsInfiniteData | undefined,
  conversationId: string,
  currentUserId: string,
): DMConversationsInfiniteData | undefined {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.map((conversation) =>
        conversation.id === conversationId
          ? withUnreadCount(conversation, currentUserId, 0)
          : conversation,
      ),
    })),
  };
}

export function markDMConversationAsUnreadInPageData(
  data: DMConversationsInfiniteData | undefined,
  conversationId: string,
  currentUserId: string,
): DMConversationsInfiniteData | undefined {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.map((conversation) =>
        conversation.id === conversationId
          ? withUnreadCount(conversation, currentUserId, 1)
          : conversation,
      ),
    })),
  };
}

export function setDMConversationMutedInPageData(
  data: DMConversationsInfiniteData | undefined,
  conversationId: string,
  currentUserId: string,
  muted: boolean,
): DMConversationsInfiniteData | undefined {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.map((conversation) =>
        conversation.id === conversationId
          ? withMuted(conversation, currentUserId, muted)
          : conversation,
      ),
    })),
  };
}

export function applyDMConversationUpdateToPageData(
  data: DMConversationsInfiniteData | undefined,
  conversation: DMConversationDTO,
  currentUserId: string,
  activeConversationId: string | null,
): DMConversationsInfiniteData {
  const normalizedConversation =
    activeConversationId === conversation.id
      ? withUnreadCount(conversation, currentUserId, 0)
      : conversation;

  return upsertDMConversationPageData(data, normalizedConversation);
}

export function applyDMConversationPresenceUpdateToPageData(
  data: DMConversationsInfiniteData | undefined,
  update: FriendPresenceUpdateDto,
): DMConversationsInfiniteData | undefined {
  if (!data) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      conversations: page.conversations.map((conversation) => ({
        ...conversation,
        participants: conversation.participants.map((participant) =>
          participant.userId === update.userId
            ? {
                ...participant,
                status: update.status,
                customStatus: update.customStatus,
                presence: {
                  status: update.status,
                  customStatus: update.customStatus,
                },
              }
            : participant,
        ),
      })),
    })),
  };
}

export function removeDMConversationFromCache(
  conversations: DMConversationDTO[] | undefined,
  conversationId: string,
) {
  if (!conversations) {
    return conversations;
  }

  return conversations.filter((conversation) => conversation.id !== conversationId);
}

export function markDMConversationAsReadInCache(
  conversations: DMConversationDTO[] | undefined,
  conversationId: string,
  currentUserId: string,
) {
  if (!conversations) {
    return conversations;
  }

  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? withUnreadCount(conversation, currentUserId, 0)
      : conversation,
  );
}

export function markDMConversationAsUnreadInCache(
  conversations: DMConversationDTO[] | undefined,
  conversationId: string,
  currentUserId: string,
) {
  if (!conversations) {
    return conversations;
  }

  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? withUnreadCount(conversation, currentUserId, 1)
      : conversation,
  );
}

export function applyDMConversationUpdate(
  conversations: DMConversationDTO[] | undefined,
  conversation: DMConversationDTO,
  currentUserId: string,
  activeConversationId: string | null,
) {
  const normalizedConversation =
    activeConversationId === conversation.id
      ? withUnreadCount(conversation, currentUserId, 0)
      : conversation;

  return upsertDMConversation(conversations, normalizedConversation);
}

export function applyDMConversationPresenceUpdate(
  conversations: DMConversationDTO[] | undefined,
  update: FriendPresenceUpdateDto,
) {
  if (!conversations) {
    return conversations;
  }

  return conversations.map((conversation) => ({
    ...conversation,
    participants: conversation.participants.map((participant) =>
      participant.userId === update.userId
        ? {
            ...participant,
            status: update.status,
            customStatus: update.customStatus,
            presence: {
              status: update.status,
              customStatus: update.customStatus,
            },
          }
        : participant,
    ),
  }));
}

export function findOtherParticipant(
  conversation: DMConversationDTO,
  currentUserId: string,
) {
  return (
    conversation.participants.find((participant) => participant.userId !== currentUserId) ??
    conversation.participants[0] ??
    null
  );
}

export function getConversationPreview(
  conversation: DMConversationDTO,
  maxLength: number,
  imageLabel: string = "Image",
  fileLabel: string = "File",
  gifLabel: string = "GIF",
) {
  const preview = conversation.lastMessage?.content?.trim() ?? "";
  const firstAttachment = conversation.lastMessage?.attachments[0];
  const normalizedPreview =
    preview.length > 0
      ? preview
      : firstAttachment
        ? isMessageGifContentType(firstAttachment.contentType)
          ? gifLabel
          : isMessageImageContentType(firstAttachment.contentType)
          ? imageLabel
          : fileLabel
        : "";

  if (normalizedPreview.length <= maxLength) {
    return normalizedPreview;
  }

  return `${normalizedPreview.slice(0, maxLength)}...`;
}

export async function fetchDMConversations() {
  const payload = await requestJson<unknown>("/api/v1/dm");
  return DMConversationsResponseSchema.parse(payload);
}

export async function fetchDMConversationsPage(cursor?: string) {
  const url = new URL("/api/v1/dm", window.location.origin);
  url.searchParams.set("paginated", "1");
  url.searchParams.set("limit", "50");

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const payload = await requestJson<unknown>(url.toString());
  return DMConversationsPageResponseSchema.parse(payload);
}

export async function fetchDMConversation(conversationId: string) {
  const payload = await requestJson<unknown>(`/api/v1/dm/${conversationId}`);
  return DMConversationDTOSchema.parse(payload);
}

export async function fetchDMMutualServers(userId: string): Promise<DMMutualServersResponse> {
  const payload = await requestJson<unknown>(
    `/api/v1/dm/users/${encodeURIComponent(userId)}/mutual-servers`,
  );
  return DMMutualServersResponseSchema.parse(payload);
}

export async function createDMConversationRequest(userId: string) {
  const payload = await requestJson<unknown>("/api/v1/dm", {
    method: "POST",
    body: { userId },
  });

  return DMConversationDTOSchema.parse(payload);
}

export async function hideDMConversationRequest(conversationId: string) {
  return requestJson<{ success: true }>(`/api/v1/dm/${conversationId}`, {
    method: "DELETE",
  });
}

export async function markDMConversationReadRequest(conversationId: string) {
  return requestJson<{ success: true }>(`/api/v1/dm/${conversationId}/read`, {
    method: "PATCH",
  });
}

export async function markDMConversationUnreadRequest(conversationId: string) {
  return requestJson<{ success: true }>(`/api/v1/dm/${conversationId}/unread`, {
    method: "PATCH",
  });
}

export async function setDMConversationMutedRequest(
  conversationId: string,
  muted: boolean,
) {
  return requestJson<{ success: true }>(`/api/v1/dm/${conversationId}/mute`, {
    method: "PATCH",
    body: { muted },
  });
}

export async function fetchDMMessages(conversationId: string, cursor?: string) {
  const url = new URL(`/api/v1/dm/${conversationId}/messages`, window.location.origin);

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const payload = await requestJson<DMMessagesResponse>(url.toString());
  return DMMessagesResponseSchema.parse(payload);
}

export async function fetchDMThreadMessages(
  conversationId: string,
  parentMessageId: string,
  cursor?: string,
) {
  const url = new URL(
    `/api/v1/dm/${conversationId}/messages/${parentMessageId}/thread`,
    window.location.origin,
  );

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const payload = await requestJson<DMThreadMessagesResponse>(url.toString());
  return DMThreadMessagesResponseSchema.parse(payload);
}
