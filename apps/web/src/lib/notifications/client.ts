"use client";

import type { NotificationDTO } from "./types";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
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
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return payload as T;
}

export const notificationsQueryKeys = {
  root: ["notifications"] as const,
  list: (limit: number) => ["notifications", "list", limit] as const,
  unreadCount: ["notifications", "unread-count"] as const,
};

export async function fetchNotifications(limit = 5): Promise<NotificationDTO[]> {
  return requestJson<NotificationDTO[]>(`/api/v1/notifications?limit=${limit}`, {
    method: "GET",
  });
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await requestJson<{ count: number }>(
    "/api/v1/notifications/unread-count",
    {
      method: "GET",
    },
  );
  return response.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await requestJson<void>(`/api/v1/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await requestJson<void>("/api/v1/notifications/read-all", {
    method: "PATCH",
  });
}

export async function deleteAllNotifications(): Promise<void> {
  await requestJson<void>("/api/v1/notifications/clear", {
    method: "DELETE",
  });
}
