"use client";

import { z } from "zod";
import { ChannelPinCursorSchema, type ChannelPinCursor } from "@/lib/servers/channel-pins";
import {
  WorkspaceServerResponseSchema,
  WorkspaceServersResponseSchema,
  WorkspaceMembersResponseSchema,
  ServerPendingInvitesResponseSchema,
  WorkspaceInviteSchema,
  WorkspaceInvitesResponseSchema,
  ServerBansResponseSchema,
  WorkspaceChannelPermissionSettingsSchema,
  ChannelThreadStateSchema,
  WorkspaceRoleSchema,
  ChatMessageSchema,
  type CreateChannelInput,
  type CreateServerInviteInput,
  type ServerBanInput,
  type ServerMemberTimeoutInput,
  type CreateServerScheduledEventInput,
  type CreateWorkspaceRoleInput,
  type ServerIconTone,
  type ServerScheduledEvent,
  type UpdateServerScheduledEventInput,
  type UpdateChannelInput,
  type UpdateWorkspaceChannelPermissionsInput,
  type UpdateWorkspaceMemberRolesInput,
  type UpdateWorkspaceRoleInput,
  type WorkspaceCategory,
  type WorkspaceChannel,
  type WorkspaceChannelPermissionSettings,
  type WorkspaceMemberFilter,
  type WorkspaceRole,
  type WorkspaceServerDetail,
  type WorkspaceServerSummary,
} from "@wizards/types";

export class WorkspaceClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "WorkspaceClientError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export const workspaceQueryKeys = {
  root: ["workspace"] as const,
  pinnedMessages: (channelId: string) =>
    ["workspace", "channel", channelId, "pinned-messages"] as const,
  channelPermissions: (channelId: string) =>
    ["workspace", "channel", channelId, "permissions"] as const,
  roles: (serverId: string) => ["workspace", "server", serverId, "roles"] as const,
  server: (serverId: string) => ["workspace", "server", serverId] as const,
  servers: ["workspace", "servers"] as const,
  serverEvents: (serverId: string) => ["workspace", "server", serverId, "events"] as const,
  serverBans: (serverId: string) => ["workspace", "server", serverId, "bans"] as const,
  /**
   * Ş13 — `Sunucu ayarları › Davetler`. Bekleyen liste düz listenin **alt anahtarıdır**:
   * bir davet iptal edilince ikisinin de tazelenmesi gerekiyor ve `serverInvites` öneki
   * tek `invalidateQueries` çağrısıyla ikisini birden yakalar.
   */
  serverInvites: (serverId: string) => ["workspace", "server", serverId, "invites"] as const,
  serverPendingInvites: (serverId: string) =>
    ["workspace", "server", serverId, "invites", "pending"] as const,
  serverMembers: (serverId: string, filter: WorkspaceMemberFilter, query: string) =>
    ["workspace", "server", serverId, "members", filter, query] as const,
};

const WorkspaceChannelPinnedMessagesResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
  nextCursor: ChannelPinCursorSchema.nullish(),
});

const WorkspaceChannelPinResponseSchema = z.object({
  message: ChatMessageSchema,
});

const WorkspaceRolesResponseSchema = z.object({
  roles: z.array(WorkspaceRoleSchema),
});

const WorkspaceRoleResponseSchema = z.object({
  role: WorkspaceRoleSchema,
});

const WorkspaceChannelPermissionsResponseSchema = z.object({
  permissions: WorkspaceChannelPermissionSettingsSchema,
});

const ChannelNotificationSettingsResponseSchema = z.object({
  level: z.enum(["all", "mentions", "muted"]),
  /**
   * SPEC-SUNUCU §6.4 (Ş9) — "Mobil bildirimleri de sustur" anahtarının kaynağı.
   * `UserChannelSettings.mobilePush` kolonu; satır yoksa `true`.
   */
  mobilePush: z.boolean().default(true),
});

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
    throw new WorkspaceClientError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.code,
    );
  }

  return payload as T;
}

export async function fetchWorkspaceServers() {
  const payload = await requestJson<unknown>("/api/v1/servers");
  const parsed = WorkspaceServersResponseSchema.parse(payload);
  return parsed.servers;
}

export function applyServerUnreadCount(
  servers: WorkspaceServerSummary[] | undefined,
  serverId: string,
  unreadCount: number,
  mentionCount?: number,
) {
  if (!servers) {
    return servers;
  }

  return servers.map((server) =>
    server.id === serverId
      ? {
          ...server,
          ...(mentionCount !== undefined ? { mentionCount } : {}),
          unreadCount,
        }
      : server,
  );
}

export async function fetchWorkspaceServer(serverId: string) {
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}`);
  const parsed = WorkspaceServerResponseSchema.parse(payload);
  return parsed.detail;
}

export async function patchChannelThreadStateRequest(
  channelId: string,
  parentMessageId: string,
  open: boolean,
) {
  const payload = await requestJson<unknown>(
    `/api/v1/channels/${channelId}/messages/${parentMessageId}/thread`,
    { body: { open }, method: "PATCH" },
  );
  return ChannelThreadStateSchema.parse(payload);
}

export async function fetchWorkspaceServerMembers(
  serverId: string,
  options: {
    cursor?: string;
    filter?: WorkspaceMemberFilter;
    limit?: number;
    q?: string;
  } = {},
) {
  const params = new URLSearchParams();
  if (options.cursor) {
    params.set("cursor", options.cursor);
  }
  // `all` yazılmaz: varsayılan çip sorgu dizesini kirletmemeli, yoksa React Query anahtarı
  // "filtresiz" ile "filter=all" diye iki ayrı önbellek satırı üretir.
  if (options.filter && options.filter !== "all") {
    params.set("filter", options.filter);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }
  const query = options.q?.trim();
  if (query) {
    params.set("q", query);
  }

  const search = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}/members${search}`);
  return WorkspaceMembersResponseSchema.parse(payload);
}

/** Ş2 §6. Ban ucu üye kimliğini alır (kim atılıyor), ban kaldırma kullanıcı kimliğini
 * (kim geri alınıyor) — banlanan artık üye değil, üyelik satırı silinmiş oluyor. */
export async function banServerMember(
  serverId: string,
  memberId: string,
  input: ServerBanInput = {},
) {
  return requestJson<{ deletedMessageCount: number; success: true }>(
    `/api/v1/servers/${serverId}/members/${memberId}/ban`,
    { body: input, method: "POST" },
  );
}

export async function unbanServerMember(serverId: string, userId: string) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/bans/${userId}`, {
    method: "DELETE",
  });
}

/** `until: null` zaman aşımını kaldırır; ayrı bir uç yok (Ş2 §2). */
export async function timeoutServerMember(
  serverId: string,
  memberId: string,
  input: ServerMemberTimeoutInput,
) {
  return requestJson<{ communicationDisabledUntil: string | null; success: true }>(
    `/api/v1/servers/${serverId}/members/${memberId}/timeout`,
    { body: input, method: "PATCH" },
  );
}

export async function fetchServerBans(
  serverId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (options.cursor) {
    params.set("cursor", options.cursor);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  const search = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}/bans${search}`);
  return ServerBansResponseSchema.parse(payload);
}

/**
 * Ş10 §7: `ERİŞİM` radyosu, keşif etiketleri ve `Gelişmiş` çip grupları oluşturma
 * gövdesinde gider — pencere kapandıktan sonra bir `PATCH` daha atmak, kullanıcının
 * `Keşfet'te listelensin` seçtiği sunucunun bir an için özel doğması demek olurdu.
 */
export async function createServerRequest(input: {
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  allowMemberAdds?: boolean;
  deletedMessageNoticeMinutes?: number;
  description?: string | null;
  discoverable?: boolean;
  iconColor?: ServerIconTone;
  iconUrl?: string | null;
  isPublic?: boolean;
  messageCharacterLimit?: number;
  name: string;
  shortName?: string | null;
  tags?: string[];
}) {
  return requestJson<{
    channelId: string | null;
    serverId: string;
  }>("/api/v1/servers", {
    body: input,
    method: "POST",
  });
}

export async function updateServerRequest(
  serverId: string,
  input: {
    allowFileUploads?: boolean;
    allowGifs?: boolean;
    allowMemberAdds?: boolean;
    description?: string | null;
    discoverable?: boolean;
    iconUrl?: string | null;
    isPublic?: boolean;
    iconColor?: ServerIconTone | null;
    messageCharacterLimit?: number;
    deletedMessageNoticeMinutes?: number;
    name?: string;
    shortName?: string | null;
    slowModeDelay?: number;
    tags?: string[];
  },
) {
  return requestJson<{ detail: WorkspaceServerDetail }>(`/api/v1/servers/${serverId}`, {
    body: input,
    method: "PATCH",
  });
}

/**
 * Ş1 §5. Üç ince sarmalayıcı, tek uç: swatch satırı, yavaş mod çip grubu ve
 * Tehlike bölgesi kendi alanlarını adlarıyla yazsın diye. `iconColor: null`
 * seçimi geri alır (deterministik türetmeye dönüş), alanı atlamaz.
 */
export async function updateServerAppearance(serverId: string, iconColor: ServerIconTone | null) {
  return updateServerRequest(serverId, { iconColor });
}

/** Sunucu geneli yavaş mod; kanalda geçerli olan `max(server, channel)`. */
export async function updateServerSlowMode(serverId: string, slowModeDelay: number) {
  return updateServerRequest(serverId, { slowModeDelay });
}

export async function transferServerOwnership(serverId: string, newOwnerUserId: string) {
  return requestJson<{ newOwnerUserId: string; success: true }>(
    `/api/v1/servers/${serverId}/transfer-ownership`,
    {
      // `acknowledged` sözleşmede `literal(true)`: onay anahtarı kapalıyken
      // düğme pasif olduğu için `false` diye geçerli bir istek yok.
      body: { acknowledged: true, newOwnerUserId },
      method: "POST",
    },
  );
}

export async function deleteServerRequest(serverId: string, confirmationName: string) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}`, {
    body: {
      confirmationName,
    },
    method: "DELETE",
  });
}

export async function leaveServerRequest(serverId: string) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/members/me`, {
    method: "DELETE",
  });
}

export async function addServerMemberRequest(serverId: string, username: string) {
  return requestJson<{
    addedUser: {
      avatarUrl: string | null;
      displayName: string | null;
      id: string;
      username: string;
    };
    detail: WorkspaceServerDetail;
  }>(`/api/v1/servers/${serverId}/members`, {
    body: { username },
    method: "POST",
  });
}

export async function fetchWorkspaceRoles(serverId: string): Promise<WorkspaceRole[]> {
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}/roles`);
  return WorkspaceRolesResponseSchema.parse(payload).roles;
}

export async function createWorkspaceRoleRequest(
  serverId: string,
  input: CreateWorkspaceRoleInput,
) {
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}/roles`, {
    body: input,
    method: "POST",
  });
  return WorkspaceRoleResponseSchema.parse(payload).role;
}

export async function updateWorkspaceRoleRequest(
  serverId: string,
  roleId: string,
  input: UpdateWorkspaceRoleInput,
) {
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}/roles/${roleId}`, {
    body: input,
    method: "PATCH",
  });
  return WorkspaceRoleResponseSchema.parse(payload).role;
}

export async function deleteWorkspaceRoleRequest(serverId: string, roleId: string) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/roles/${roleId}`, {
    method: "DELETE",
  });
}

export async function updateWorkspaceMemberRolesRequest(
  serverId: string,
  memberId: string,
  input: UpdateWorkspaceMemberRolesInput,
) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/members/${memberId}/roles`, {
    body: input,
    method: "PATCH",
  });
}

export async function createCategoryRequest(serverId: string, name: string) {
  return requestJson<{ id: string }>(`/api/v1/servers/${serverId}/categories`, {
    body: { name },
    method: "POST",
  });
}

export async function updateCategoryRequest(serverId: string, categoryId: string, name: string) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/categories/${categoryId}`, {
    body: { name },
    method: "PATCH",
  });
}

export async function deleteCategoryRequest(serverId: string, categoryId: string) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export async function createChannelRequest(serverId: string, input: CreateChannelInput) {
  return requestJson<{ id: string }>(`/api/v1/servers/${serverId}/channels`, {
    body: input,
    method: "POST",
  });
}

export async function updateChannelRequest(channelId: string, input: UpdateChannelInput) {
  return requestJson<{ success: true }>(`/api/v1/channels/${channelId}`, {
    body: input,
    method: "PATCH",
  });
}

export async function fetchChannelPermissionSettings(
  channelId: string,
): Promise<WorkspaceChannelPermissionSettings> {
  const payload = await requestJson<unknown>(`/api/v1/channels/${channelId}/permissions`);
  return WorkspaceChannelPermissionsResponseSchema.parse(payload).permissions;
}

export async function updateChannelPermissionSettings(
  channelId: string,
  input: UpdateWorkspaceChannelPermissionsInput,
) {
  const payload = await requestJson<unknown>(`/api/v1/channels/${channelId}/permissions`, {
    body: input,
    method: "PATCH",
  });
  return WorkspaceChannelPermissionsResponseSchema.parse(payload).permissions;
}

export async function deleteChannelRequest(channelId: string) {
  return requestJson<{ success: true }>(`/api/v1/channels/${channelId}`, {
    method: "DELETE",
  });
}

export async function clearChannelMessagesRequest(channelId: string) {
  return requestJson<{ deletedCount: number; success: true }>(
    `/api/v1/channels/${channelId}/messages`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchChannelPinnedMessages(channelId: string) {
  return (await fetchChannelPinnedMessagesPage(channelId)).messages;
}

export async function fetchChannelPinnedMessagesPage(channelId: string, cursor?: ChannelPinCursor) {
  const query = cursor
    ? `?${new URLSearchParams({ before: cursor.pinnedAt, beforeId: cursor.messageId })}`
    : "";
  const payload = await requestJson<unknown>(`/api/v1/channels/${channelId}/pins${query}`);
  return WorkspaceChannelPinnedMessagesResponseSchema.parse(payload);
}

export async function pinChannelMessageRequest(channelId: string, messageId: string) {
  const payload = await requestJson<unknown>(
    `/api/v1/channels/${channelId}/messages/${messageId}/pin`,
    { method: "POST" },
  );
  return WorkspaceChannelPinResponseSchema.parse(payload).message;
}

export async function unpinChannelMessageRequest(channelId: string, messageId: string) {
  const payload = await requestJson<unknown>(
    `/api/v1/channels/${channelId}/messages/${messageId}/pin`,
    { method: "DELETE" },
  );
  return WorkspaceChannelPinResponseSchema.parse(payload).message;
}

export async function fetchChannelNotificationSettings(channelId: string) {
  const payload = await requestJson<unknown>(`/api/v1/channels/${channelId}/notification-settings`);
  return ChannelNotificationSettingsResponseSchema.parse(payload);
}

/**
 * `level` tek başına da geçilebilir: `mobilePush` atlandığında uç satırın mevcut mobil
 * tercihini korur. Bildirim menüsü (yalnız düzey değiştirir) ile §6.4 penceresi (ikisini
 * birden yazar) böylece aynı ucu paylaşır.
 */
export async function updateChannelNotificationSettings(
  channelId: string,
  input:
    "all" | "mentions" | "muted" | { level: "all" | "mentions" | "muted"; mobilePush?: boolean },
) {
  const payload = await requestJson<unknown>(
    `/api/v1/channels/${channelId}/notification-settings`,
    {
      body: typeof input === "string" ? { level: input } : input,
      method: "PATCH",
    },
  );
  return ChannelNotificationSettingsResponseSchema.parse(payload);
}

export async function reorderChannelsRequest(
  serverId: string,
  items: Array<{
    categoryId: string | null;
    id: string;
    position: number;
  }>,
) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/channels/reorder`, {
    body: { items },
    method: "POST",
  });
}

export async function reorderCategoriesRequest(
  serverId: string,
  items: Array<{
    id: string;
    position: number;
  }>,
) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/categories/reorder`, {
    body: { items },
    method: "POST",
  });
}

/**
 * Ş3 — davet oluşturma. `targetUserId` verildiğinde uç hedefli davete geçer: arkadaşlık
 * kontrolünden geçmeyen hedef `400`, açık daveti olan hedef için **aynı** davet döner.
 */
export async function createServerInvite(serverId: string, input: CreateServerInviteInput) {
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}/invites`, {
    body: input,
    method: "POST",
  });

  return WorkspaceInviteSchema.parse(payload);
}

/**
 * `pending: true` → yalnız hedefi olan, kullanılmamış, süresi geçmemiş davetler; satır
 * hedef kimliğini de taşır (`ServerPendingInvite`).
 */
export async function fetchServerInvites(
  serverId: string,
  options: { pending: true },
): Promise<z.infer<typeof ServerPendingInvitesResponseSchema>>;
export async function fetchServerInvites(
  serverId: string,
  options?: { pending?: false },
): Promise<z.infer<typeof WorkspaceInvitesResponseSchema>>;
export async function fetchServerInvites(serverId: string, options: { pending?: boolean } = {}) {
  const query = options.pending ? "?pending=1" : "";
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}/invites${query}`, {
    method: "GET",
  });

  return options.pending
    ? ServerPendingInvitesResponseSchema.parse(payload)
    : WorkspaceInvitesResponseSchema.parse(payload);
}

export async function revokeServerInvite(serverId: string, inviteId: string) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/invites/${inviteId}`, {
    method: "DELETE",
  });
}

export async function kickMemberRequest(serverId: string, memberId: string) {
  return requestJson<{ success: true }>(`/api/v1/servers/${serverId}/members/${memberId}`, {
    method: "DELETE",
  });
}

function sortChannels(channels: WorkspaceChannel[]) {
  return [...channels].sort((left, right) => left.position - right.position);
}

function cloneCategory(category: WorkspaceCategory): WorkspaceCategory {
  return {
    ...category,
    channels: [...category.channels],
  };
}

export function applyChannelPatch(
  detail: WorkspaceServerDetail,
  channelId: string,
  patch: Partial<WorkspaceChannel>,
) {
  const categories = detail.categories.map(cloneCategory);
  const ungroupedChannels = [...detail.ungroupedChannels];

  const updateChannelCollection = (channels: WorkspaceChannel[]) =>
    channels.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel));

  return {
    ...detail,
    categories: categories.map((category) => ({
      ...category,
      channels: updateChannelCollection(category.channels),
    })),
    ungroupedChannels: updateChannelCollection(ungroupedChannels),
  };
}

export function applyChannelRemoval(detail: WorkspaceServerDetail, channelId: string) {
  return {
    ...detail,
    categories: detail.categories.map((category) => ({
      ...category,
      channels: category.channels.filter((channel) => channel.id !== channelId),
    })),
    ungroupedChannels: detail.ungroupedChannels.filter((channel) => channel.id !== channelId),
  };
}

export function applyChannelReorder(
  detail: WorkspaceServerDetail,
  items: Array<{
    categoryId: string | null;
    id: string;
    position: number;
  }>,
) {
  const channelMap = new Map<string, WorkspaceChannel>();
  const grouped = new Map<string | null, WorkspaceChannel[]>();

  for (const channel of detail.ungroupedChannels) {
    channelMap.set(channel.id, channel);
  }

  for (const category of detail.categories) {
    for (const channel of category.channels) {
      channelMap.set(channel.id, channel);
    }
  }

  grouped.set(null, [...detail.ungroupedChannels]);
  for (const category of detail.categories) {
    grouped.set(category.id, [...category.channels]);
  }

  for (const item of items) {
    const channel = channelMap.get(item.id);

    if (!channel) {
      continue;
    }

    const previousGroup = grouped.get(channel.categoryId ?? null) ?? [];
    const nextPreviousGroup = previousGroup.filter((entry) => entry.id !== channel.id);
    grouped.set(channel.categoryId ?? null, nextPreviousGroup);

    const nextChannel = {
      ...channel,
      categoryId: item.categoryId,
      position: item.position,
    };
    const current = grouped.get(item.categoryId) ?? [];
    current.push(nextChannel);
    grouped.set(item.categoryId, current);
  }

  return {
    ...detail,
    categories: detail.categories.map((category) => ({
      ...category,
      channels: sortChannels(grouped.get(category.id) ?? []),
    })),
    ungroupedChannels: sortChannels(grouped.get(null) ?? []),
  };
}

export function applyCategoryReorder(
  detail: WorkspaceServerDetail,
  items: Array<{
    id: string;
    position: number;
  }>,
) {
  const positionMap = new Map(items.map((item) => [item.id, item.position]));

  return {
    ...detail,
    categories: [...detail.categories]
      .map((category) => ({
        ...category,
        position: positionMap.get(category.id) ?? category.position,
      }))
      .sort((left, right) => left.position - right.position),
  };
}

export function getServerHref(server: WorkspaceServerSummary) {
  if (!server.defaultChannelId) {
    return "/channels";
  }

  return `/channels/${server.id}/${server.defaultChannelId}`;
}

export async function markChannelReadRequest(channelId: string) {
  return requestJson<{
    firstUnreadMessageId: string | null;
    mentionCount: number;
    serverId: string;
    unreadCount: number;
  }>(`/api/v1/channels/${channelId}/read`, {
    method: "PATCH",
  });
}

export async function listServerEventsRequest(serverId: string, includePast = false) {
  return requestJson<{ events: ServerScheduledEvent[] }>(
    `/api/v1/servers/${serverId}/events${includePast ? "?includePast=true" : ""}`,
  );
}

export async function createServerEventRequest(
  serverId: string,
  input: CreateServerScheduledEventInput,
) {
  return requestJson<{ event: ServerScheduledEvent }>(`/api/v1/servers/${serverId}/events`, {
    body: input,
    method: "POST",
  });
}

export async function updateServerEventRequest(
  serverId: string,
  eventId: string,
  input: UpdateServerScheduledEventInput,
) {
  return requestJson<{ event: ServerScheduledEvent }>(
    `/api/v1/servers/${serverId}/events/${eventId}`,
    { body: input, method: "PATCH" },
  );
}

/** Cancelling keeps the row, so the cancelled event comes back in the body. */
export async function cancelServerEventRequest(serverId: string, eventId: string) {
  return requestJson<{ event: ServerScheduledEvent }>(
    `/api/v1/servers/${serverId}/events/${eventId}`,
    { method: "DELETE" },
  );
}

export async function setServerEventInterestRequest(
  serverId: string,
  eventId: string,
  interested: boolean,
) {
  return requestJson<{ event: ServerScheduledEvent }>(
    `/api/v1/servers/${serverId}/events/${eventId}/interest`,
    { body: { interested }, method: "POST" },
  );
}
