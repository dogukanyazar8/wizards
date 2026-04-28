"use client";

import {
  DMConversationDTOSchema,
  type DMConversationDTO,
} from "@wizards/types";
import type { FriendPresenceUpdateDto } from "@/lib/friends/types";
import {
  DMConversationsResponseSchema,
  DMMessagesResponseSchema,
  type DMMessagesResponse,
} from "@/lib/dm/types";

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
  root: ["dm"] as const,
};

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

export function upsertDMConversation(
  conversations: DMConversationDTO[] | undefined,
  conversation: DMConversationDTO,
): DMConversationDTO[] {
  const nextConversations = conversations ?? [];
  const withoutCurrent = nextConversations.filter((item) => item.id !== conversation.id);
  return sortConversations([conversation, ...withoutCurrent]);
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
) {
  const preview = conversation.lastMessage?.content?.trim() ?? "";
  const normalizedPreview =
    preview.length > 0
      ? preview
      : conversation.lastMessage?.attachments.length
        ? imageLabel
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

export async function fetchDMMessages(conversationId: string, cursor?: string) {
  const url = new URL(`/api/v1/dm/${conversationId}/messages`, window.location.origin);

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const payload = await requestJson<DMMessagesResponse>(url.toString());
  return DMMessagesResponseSchema.parse(payload);
}
