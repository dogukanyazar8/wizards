"use client";

import {
  WorkspaceServerResponseSchema,
  WorkspaceServersResponseSchema,
  type UpdateChannelInput,
  type WorkspaceCategory,
  type WorkspaceChannel,
  type WorkspaceServerDetail,
  type WorkspaceServerSummary,
} from "@wizards/types";

export class WorkspaceClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
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
  server: (serverId: string) => ["workspace", "server", serverId] as const,
  servers: ["workspace", "servers"] as const,
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
        error?: string;
      }
    | null;

  if (!response.ok) {
    throw new WorkspaceClientError(payload?.error ?? "Request failed", response.status);
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
) {
  if (!servers) {
    return servers;
  }

  return servers.map((server) =>
    server.id === serverId
      ? {
          ...server,
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

export async function createServerRequest(input: {
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  allowMemberAdds?: boolean;
  description?: string | null;
  iconUrl?: string | null;
  name: string;
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
    iconUrl?: string | null;
    name?: string;
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

export async function createCategoryRequest(serverId: string, name: string) {
  return requestJson<{ id: string }>(`/api/v1/servers/${serverId}/categories`, {
    body: { name },
    method: "POST",
  });
}

export async function createChannelRequest(
  serverId: string,
  input: {
    categoryId?: string | null;
    name: string;
    topic?: string | null;
    type: "TEXT" | "VOICE";
  },
) {
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

export async function createInviteRequest(
  serverId: string,
  input: {
    channelId?: string | null;
    expiresInHours?: number;
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

export function getServerHref(server: WorkspaceServerSummary) {
  if (!server.defaultChannelId) {
    return "/channels";
  }

  return `/channels/${server.id}/${server.defaultChannelId}`;
}

export async function markChannelReadRequest(channelId: string) {
  return requestJson<{
    serverId: string;
    unreadCount: number;
  }>(`/api/v1/channels/${channelId}/read`, {
    method: "PATCH",
  });
}
