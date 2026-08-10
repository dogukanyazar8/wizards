"use client";

import { z } from "zod";
import {
  WorkspaceServerResponseSchema,
  WorkspaceServersResponseSchema,
  WorkspaceMembersResponseSchema,
  WorkspaceChannelPermissionSettingsSchema,
  WorkspaceRoleSchema,
  ChatMessageSchema,
  type CreateChannelInput,
  type CreateServerScheduledEventInput,
  type CreateWorkspaceRoleInput,
  type ServerScheduledEvent,
  type UpdateServerScheduledEventInput,
  type UpdateChannelInput,
  type UpdateWorkspaceChannelPermissionsInput,
  type UpdateWorkspaceMemberRolesInput,
  type UpdateWorkspaceRoleInput,
  type WorkspaceCategory,
  type WorkspaceChannel,
  type WorkspaceChannelPermissionSettings,
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
};

const WorkspaceChannelPinnedMessagesResponseSchema = z.object({
  messages: z.array(ChatMessageSchema),
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

export async function fetchWorkspaceServerMembers(
  serverId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (options.cursor) {
    params.set("cursor", options.cursor);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await requestJson<unknown>(`/api/v1/servers/${serverId}/members${query}`);
  return WorkspaceMembersResponseSchema.parse(payload);
}

export async function createServerRequest(input: {
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  allowMemberAdds?: boolean;
  description?: string | null;
  iconUrl?: string | null;
  name: string;
  shortName?: string | null;
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
    messageCharacterLimit?: number;
    deletedMessageNoticeMinutes?: number;
    name?: string;
    shortName?: string | null;
    tags?: string[];
  },
) {
  return requestJson<{ detail: WorkspaceServerDetail }>(`/api/v1/servers/${serverId}`, {
    body: input,
    method: "PATCH",
  });
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
  const payload = await requestJson<unknown>(`/api/v1/channels/${channelId}/pins`);
  const parsed = WorkspaceChannelPinnedMessagesResponseSchema.parse(payload);
  return parsed.messages;
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

export async function updateChannelNotificationSettings(
  channelId: string,
  level: "all" | "mentions" | "muted",
) {
  const payload = await requestJson<unknown>(
    `/api/v1/channels/${channelId}/notification-settings`,
    {
      body: { level },
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

export async function createInviteRequest(
  serverId: string,
  input: {
    channelId?: string | null;
    expiresInHours?: number | null;
    maxUses?: number | null;
  },
) {
  return requestJson<{ code: string }>(`/api/v1/servers/${serverId}/invites`, {
    body: input,
    method: "POST",
  });
}

export async function revokeInviteRequest(serverId: string, inviteId: string) {
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
