import {
  MobileAssignableRolesResponseSchema,
  MobileServerRoleOverviewResponseSchema,
  MobileCategoryCreateRequestSchema,
  MobileCategoryCreateResponseSchema,
  MobileCategoryUpdateRequestSchema,
  MobileChannelCreateRequestSchema,
  MobileChannelCreateResponseSchema,
  MobileChannelHistoryClearResponseSchema,
  MobileChannelIdParamsSchema,
  MobileChannelUpdateRequestSchema,
  MobileMemberRolesUpdateRequestSchema,
  MobileMutationSuccessResponseSchema,
  MobileServerCategoryParamsSchema,
  MobileServerChannelParamsSchema,
  MobileServerCreateRequestSchema,
  MobileServerCreateResponseSchema,
  MobileServerDeleteRequestSchema,
  MobileServerIdParamsSchema,
  MobileServerInviteCreateRequestSchema,
  MobileServerInviteCreateResponseSchema,
  MobileServerInvitesResponseSchema,
  MobileServerJoinRequestSchema,
  MobileServerJoinResponseSchema,
  MobileServerMemberParamsSchema,
  MobileServerMembersQuerySchema,
  MobileServerMembersResponseSchema,
  MobileServerUpdateRequestSchema,
  MobileManagedWorkspaceServerDetailResponseSchema,
  type MobileAssignableRolesResponse,
  type MobileServerRoleOverviewResponse,
  type MobileCategoryCreateResponse,
  type MobileChannelCreateResponse,
  type MobileChannelHistoryClearResponse,
  type MobileManagedWorkspaceServerDetailResponse,
  type MobileMutationSuccessResponse,
  type MobileServerCreateRequest,
  type MobileServerCreateResponse,
  type MobileServerInviteCreateRequest,
  type MobileServerInviteCreateResponse,
  type MobileServerInvitesResponse,
  type MobileServerJoinRequest,
  type MobileServerJoinResponse,
  type MobileServerMembersResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export const MOBILE_SERVER_MEMBERS_LIMIT = 50;

export function buildMobileServerCreatePath(): string {
  return "/api/v1/mobile/servers";
}

export function buildMobileServerJoinPath(): string {
  return "/api/v1/mobile/servers/join";
}

export function buildMobileServerInviteCreatePath(input: { serverId: string }): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(input.serverId)}/invites`;
}

export function buildMobileServerPath(input: { serverId: string }): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(input.serverId)}`;
}

export function buildMobileServerCategoryPath(input: {
  categoryId: string;
  serverId: string;
}): string {
  return `${buildMobileServerPath(input)}/categories/${encodeURIComponent(input.categoryId)}`;
}

export function buildMobileServerChannelsPath(input: { serverId: string }): string {
  return `${buildMobileServerPath(input)}/channels`;
}

export function buildMobileServerChannelPath(input: {
  channelId: string;
  serverId: string;
}): string {
  return `${buildMobileServerChannelsPath(input)}/${encodeURIComponent(input.channelId)}`;
}

export function buildMobileServerMembersPath(input: {
  cursor?: string | null;
  serverId: string;
}): string {
  const params = new URLSearchParams({ limit: String(MOBILE_SERVER_MEMBERS_LIMIT) });
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return `${buildMobileServerPath(input)}/members?${params.toString()}`;
}

export function buildMobileServerRolesPath(input: { serverId: string }): string {
  return `${buildMobileServerPath(input)}/roles`;
}

export function buildMobileServerRoleOverviewPath(input: { serverId: string }): string {
  return `${buildMobileServerRolesPath(input)}/overview`;
}

export function buildMobileServerMemberPath(input: { memberId: string; serverId: string }): string {
  return `${buildMobileServerPath(input)}/members/${encodeURIComponent(input.memberId)}`;
}

export function buildMobileServerMemberRolesPath(input: {
  memberId: string;
  serverId: string;
}): string {
  return `${buildMobileServerMemberPath(input)}/roles`;
}

export function buildMobileChannelHistoryClearPath(input: { channelId: string }): string {
  return `/api/v1/mobile/channels/${encodeURIComponent(input.channelId)}/history`;
}

export async function createMobileServer(
  client: MobileApiClient,
  input: MobileServerCreateRequest,
): Promise<MobileServerCreateResponse> {
  const body = MobileServerCreateRequestSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerCreatePath(), {
    body,
    method: "POST",
  });

  return MobileServerCreateResponseSchema.parse(payload);
}

export async function joinMobileServer(
  client: MobileApiClient,
  input: MobileServerJoinRequest,
): Promise<MobileServerJoinResponse> {
  const body = MobileServerJoinRequestSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerJoinPath(), {
    body,
    method: "POST",
  });

  return MobileServerJoinResponseSchema.parse(payload);
}

export async function fetchMobileServerInvites(
  client: MobileApiClient,
  input: { serverId: string },
): Promise<MobileServerInvitesResponse> {
  const params = MobileServerIdParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerInviteCreatePath(params));
  return MobileServerInvitesResponseSchema.parse(payload);
}

export async function createMobileServerInvite(
  client: MobileApiClient,
  serverId: string,
  input: MobileServerInviteCreateRequest,
): Promise<MobileServerInviteCreateResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId });
  const body = MobileServerInviteCreateRequestSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerInviteCreatePath(params), {
    body,
    method: "POST",
  });

  return MobileServerInviteCreateResponseSchema.parse(payload);
}

export type UpdateMobileServerInput = {
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  description?: string | null;
  name?: string;
  serverId: string;
  shortName?: string | null;
};

export async function updateMobileServer(
  client: MobileApiClient,
  input: UpdateMobileServerInput,
): Promise<MobileManagedWorkspaceServerDetailResponse> {
  const { serverId, ...fields } = input;
  const params = MobileServerIdParamsSchema.parse({ serverId });
  const body = MobileServerUpdateRequestSchema.parse(fields);
  const payload = await client.requestJson<unknown>(buildMobileServerPath(params), {
    body,
    method: "PATCH",
  });

  return MobileManagedWorkspaceServerDetailResponseSchema.parse(payload);
}

export async function deleteMobileServer(
  client: MobileApiClient,
  input: { name: string; serverId: string },
): Promise<MobileMutationSuccessResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId: input.serverId });
  const body = MobileServerDeleteRequestSchema.parse({ confirmationName: input.name });
  const payload = await client.requestJson<unknown>(buildMobileServerPath(params), {
    body,
    method: "DELETE",
  });

  return MobileMutationSuccessResponseSchema.parse(payload);
}

export async function createMobileCategory(
  client: MobileApiClient,
  input: { name: string; serverId: string },
): Promise<MobileCategoryCreateResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId: input.serverId });
  const body = MobileCategoryCreateRequestSchema.parse({ name: input.name });
  const payload = await client.requestJson<unknown>(`${buildMobileServerPath(params)}/categories`, {
    body,
    method: "POST",
  });

  return MobileCategoryCreateResponseSchema.parse(payload);
}

export async function updateMobileCategory(
  client: MobileApiClient,
  input: { categoryId: string; name: string; serverId: string },
): Promise<MobileCategoryCreateResponse> {
  const params = MobileServerCategoryParamsSchema.parse({
    categoryId: input.categoryId,
    serverId: input.serverId,
  });
  const body = MobileCategoryUpdateRequestSchema.parse({ name: input.name });
  const payload = await client.requestJson<unknown>(buildMobileServerCategoryPath(params), {
    body,
    method: "PATCH",
  });

  return MobileCategoryCreateResponseSchema.parse(payload);
}

export async function deleteMobileCategory(
  client: MobileApiClient,
  input: { categoryId: string; serverId: string },
): Promise<MobileMutationSuccessResponse> {
  const params = MobileServerCategoryParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerCategoryPath(params), {
    method: "DELETE",
  });

  return MobileMutationSuccessResponseSchema.parse(payload);
}

export async function createMobileChannel(
  client: MobileApiClient,
  input: {
    categoryId?: string | null;
    name: string;
    serverId: string;
    topic?: string | null;
    type: "TEXT" | "VOICE";
  },
): Promise<MobileChannelCreateResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId: input.serverId });
  const { serverId: _serverId, ...request } = input;
  const body = MobileChannelCreateRequestSchema.parse(request);
  const payload = await client.requestJson<unknown>(buildMobileServerChannelsPath(params), {
    body,
    method: "POST",
  });

  return MobileChannelCreateResponseSchema.parse(payload);
}

export async function updateMobileChannel(
  client: MobileApiClient,
  input: {
    categoryId?: string | null;
    channelId: string;
    name?: string;
    serverId: string;
    topic?: string | null;
  },
): Promise<MobileChannelCreateResponse> {
  const params = MobileServerChannelParamsSchema.parse({
    channelId: input.channelId,
    serverId: input.serverId,
  });
  const { channelId: _channelId, serverId: _serverId, ...request } = input;
  const body = MobileChannelUpdateRequestSchema.parse(request);
  const payload = await client.requestJson<unknown>(buildMobileServerChannelPath(params), {
    body,
    method: "PATCH",
  });

  return MobileChannelCreateResponseSchema.parse(payload);
}

export async function deleteMobileChannel(
  client: MobileApiClient,
  input: { channelId: string; serverId: string },
): Promise<MobileMutationSuccessResponse> {
  const params = MobileServerChannelParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerChannelPath(params), {
    method: "DELETE",
  });

  return MobileMutationSuccessResponseSchema.parse(payload);
}

export async function fetchMobileServerMembers(
  client: MobileApiClient,
  input: { cursor?: string | null; serverId: string },
): Promise<MobileServerMembersResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId: input.serverId });
  const query = MobileServerMembersQuerySchema.parse({
    ...(input.cursor ? { cursor: input.cursor } : {}),
    limit: MOBILE_SERVER_MEMBERS_LIMIT,
  });
  const pathInput = {
    ...(query.cursor ? { cursor: query.cursor } : {}),
    serverId: params.serverId,
  };
  const payload = await client.requestJson<unknown>(buildMobileServerMembersPath(pathInput));

  return MobileServerMembersResponseSchema.parse(payload);
}

export async function fetchMobileAssignableRoles(
  client: MobileApiClient,
  input: { serverId: string },
): Promise<MobileAssignableRolesResponse> {
  const params = MobileServerIdParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerRolesPath(params));
  return MobileAssignableRolesResponseSchema.parse(payload);
}

export async function fetchMobileServerRoleOverview(
  client: MobileApiClient,
  input: { serverId: string },
): Promise<MobileServerRoleOverviewResponse> {
  const params = MobileServerIdParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerRoleOverviewPath(params));
  return MobileServerRoleOverviewResponseSchema.parse(payload);
}

export async function updateMobileMemberRoles(
  client: MobileApiClient,
  input: { memberId: string; roleIds: readonly string[]; serverId: string },
): Promise<MobileMutationSuccessResponse> {
  const params = MobileServerMemberParamsSchema.parse({
    memberId: input.memberId,
    serverId: input.serverId,
  });
  const body = MobileMemberRolesUpdateRequestSchema.parse({ roleIds: input.roleIds });
  const payload = await client.requestJson<unknown>(buildMobileServerMemberRolesPath(params), {
    body,
    method: "PATCH",
  });

  return MobileMutationSuccessResponseSchema.parse(payload);
}

export async function kickMobileMember(
  client: MobileApiClient,
  input: { memberId: string; serverId: string },
): Promise<MobileMutationSuccessResponse> {
  const params = MobileServerMemberParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerMemberPath(params), {
    method: "DELETE",
  });

  return MobileMutationSuccessResponseSchema.parse(payload);
}

export async function clearMobileChannelHistory(
  client: MobileApiClient,
  input: { channelId: string },
): Promise<MobileChannelHistoryClearResponse> {
  const params = MobileChannelIdParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileChannelHistoryClearPath(params), {
    method: "DELETE",
  });

  return MobileChannelHistoryClearResponseSchema.parse(payload);
}
