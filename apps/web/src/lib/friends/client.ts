"use client";

import {
  BlockedFriendsResponseSchema,
  FriendErrorCodeSchema,
  FriendRequestMutationResponseSchema,
  FriendsResponseSchema,
  PendingFriendsResponseSchema,
  type FriendDto,
  type FriendErrorCode,
  type FriendPresenceUpdateDto,
} from "@/lib/friends/types";

export class FriendsClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: FriendErrorCode,
  ) {
    super(message);
    this.name = "FriendsClientError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export const friendsQueryKeys = {
  blocked: ["friends", "blocked"] as const,
  list: ["friends", "list"] as const,
  pending: ["friends", "pending"] as const,
  root: ["friends"] as const,
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
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    const parsedCode = FriendErrorCodeSchema.safeParse(payload?.code);

    throw new FriendsClientError(
      payload?.error ?? "Request failed",
      response.status,
      parsedCode.success ? parsedCode.data : undefined,
    );
  }

  return payload as T;
}

export function applyFriendPresenceUpdate(
  friends: FriendDto[] | undefined,
  update: FriendPresenceUpdateDto,
) {
  if (!friends) {
    return friends;
  }

  return friends.map((friend) =>
    friend.id === update.userId
      ? {
          ...friend,
          status: update.status,
          customStatus: update.customStatus,
          presence: {
            status: update.status,
            customStatus: update.customStatus,
          },
        }
      : friend,
  );
}

export async function fetchFriends() {
  const payload = await requestJson<unknown>("/api/v1/friends");
  return FriendsResponseSchema.parse(payload);
}

export async function fetchPendingFriends() {
  const payload = await requestJson<unknown>("/api/v1/friends/pending");
  return PendingFriendsResponseSchema.parse(payload);
}

export async function fetchBlockedFriends() {
  const payload = await requestJson<unknown>("/api/v1/friends/blocked");
  return BlockedFriendsResponseSchema.parse(payload);
}

export async function sendFriendRequestRequest(username: string) {
  const payload = await requestJson<unknown>("/api/v1/friends/request", {
    body: { username },
    method: "POST",
  });

  return FriendRequestMutationResponseSchema.parse(payload).request;
}

export async function actOnFriendRequestRequest(requestId: string, action: "accept" | "decline") {
  const payload = await requestJson<unknown>(`/api/v1/friends/request/${requestId}`, {
    body: { action },
    method: "PATCH",
  });

  return FriendRequestMutationResponseSchema.parse(payload).request;
}

export async function cancelFriendRequestRequest(requestId: string) {
  return requestJson<{ success: true }>(`/api/v1/friends/request/${requestId}`, {
    method: "DELETE",
  });
}

export async function removeFriendRequest(friendUserId: string) {
  return requestJson<{ success: true }>(`/api/v1/friends/${friendUserId}`, {
    method: "DELETE",
  });
}

export async function blockFriendRequest(friendUserId: string) {
  return requestJson<{ blockedUser: { id: string } }>(`/api/v1/friends/block/${friendUserId}`, {
    method: "POST",
  });
}

export async function unblockFriendRequest(friendUserId: string) {
  return requestJson<{ success: true }>(`/api/v1/friends/block/${friendUserId}`, {
    method: "DELETE",
  });
}
