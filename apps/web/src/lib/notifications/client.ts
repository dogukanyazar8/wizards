"use client";

import type { NotifPanelTab } from "@wizards/types";

import type { NotificationCounts, NotificationPageDTO } from "./types";

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
  unreadCount: ["notifications", "unread-count"] as const,
  /**
   * Ş2 §7. Sekme anahtarın **parçası**: dört sekme dört ayrı sonsuz listedir ve tek anahtarda
   * toplansalardı sekme değiştiren kullanıcı önceki sekmenin sayfalarını görürdü.
   */
  panel: (tab: NotifPanelTab) => ["notifications", "panel", tab] as const,
  counts: ["notifications", "counts"] as const,
};

/**
 * §3 — panelin sayfası. `limit` varsayılan 6 (sunucuda da 6), `cursor` keyset.
 *
 * `useInfiniteQuery` tüketicisine not: kesişim gözlemcisinin efekt bağımlılıkları **ilkel**
 * olmalı (`[hasNextPage, isFetchingNextPage]`), sorgu nesnesi değil. Nesne geçilirse gözlemci
 * her render'da sökülüp kurulur ve her render bir sayfa daha çeker.
 */
export async function fetchNotificationPage(
  tab: NotifPanelTab,
  cursor?: string,
  limit?: number,
): Promise<NotificationPageDTO> {
  const params = new URLSearchParams({ tab });
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }

  return requestJson<NotificationPageDTO>(`/api/v1/notifications?${params.toString()}`, {
    method: "GET",
  });
}

/** §5 — dörtlü sayaç. Zil noktası da bunu okur (`counts.all > 0`). */
export async function fetchNotificationCounts(): Promise<NotificationCounts> {
  const response = await requestJson<{ counts: NotificationCounts }>(
    "/api/v1/notifications/unread-count",
    { method: "GET" },
  );
  return response.counts;
}

/**
 * §4 — okundu durumunu çevirir ve **güncel sayacı** döndürür. İstemci sayacı artırmaz; bu
 * yanıtı ve `notification:read` olayını okur.
 */
export async function setNotificationRead(id: string, read: boolean): Promise<NotificationCounts> {
  const response = await requestJson<{ counts: NotificationCounts }>(
    `/api/v1/notifications/${id}/read`,
    { body: { read }, method: "POST" },
  );
  return response.counts;
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await requestJson<{ count: number }>("/api/v1/notifications/unread-count", {
    method: "GET",
  });
  return response.count;
}

/** §7 — toplu okuma, güncel sayacıyla. */
export async function markAllNotificationsRead(): Promise<NotificationCounts> {
  const response = await requestJson<{ counts: NotificationCounts }>(
    "/api/v1/notifications/read-all",
    { method: "PATCH" },
  );
  return response.counts;
}
