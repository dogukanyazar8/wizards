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
  MobileRoleCreateRequestSchema,
  MobileRoleMutationResponseSchema,
  MobileRoleUpdateRequestSchema,
  MobileServerRoleParamsSchema,
  MobileServerCategoryParamsSchema,
  MobileServerChannelParamsSchema,
  MobileServerCreateRequestSchema,
  MobileServerCreateResponseSchema,
  MobileServerDeleteRequestSchema,
  MobileServerIdParamsSchema,
  MobileServerInviteCodeParamsSchema,
  MobileServerInviteCreateRequestSchema,
  MobileServerInviteCreateResponseSchema,
  MobileServerInviteDeclineResponseSchema,
  MobileServerInviteLinkUpdateRequestSchema,
  MobileServerInviteParamsSchema,
  MobileServerInviteQrResponseSchema,
  MobileServerInviteSheetResponseSchema,
  MobileServerInvitesResponseSchema,
  MobileServerTargetedInviteCreateRequestSchema,
  MobileServerTargetedInviteCreateResponseSchema,
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
  type MobileServerInviteDeclineResponse,
  type MobileServerInviteQrResponse,
  type MobileServerInviteSheetResponse,
  type MobileServerTargetedInviteCreateResponse,
  type MobileRoleMutationResponse,
  type MobilePermissionKey,
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

export function buildMobileServerInvitePath(input: { inviteId: string; serverId: string }): string {
  return `${buildMobileServerInviteCreatePath({ serverId: input.serverId })}/${encodeURIComponent(
    input.inviteId,
  )}`;
}

export function buildMobileServerInviteSheetPath(input: { serverId: string }): string {
  return `${buildMobileServerInviteCreatePath(input)}/sheet`;
}

export function buildMobileServerTargetedInvitePath(input: { serverId: string }): string {
  return `${buildMobileServerInviteCreatePath(input)}/targeted`;
}

export function buildMobileServerInviteQrPath(input: {
  inviteId: string;
  serverId: string;
}): string {
  return `${buildMobileServerInvitePath(input)}/qr`;
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

export function buildMobileServerRolePath(input: { roleId: string; serverId: string }): string {
  return `${buildMobileServerRolesPath(input)}/${encodeURIComponent(input.roleId)}`;
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

export async function deleteMobileServerInvite(
  client: MobileApiClient,
  input: { inviteId: string; serverId: string },
): Promise<void> {
  const params = MobileServerInviteParamsSchema.parse(input);
  await client.requestJson<unknown>(buildMobileServerInvitePath(params), { method: "DELETE" });
}

/** 2a/2b — link card, friends and pending targeted invites in one read. */
export async function fetchMobileServerInviteSheet(
  client: MobileApiClient,
  input: { serverId: string },
): Promise<MobileServerInviteSheetResponse> {
  const params = MobileServerIdParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerInviteSheetPath(params));
  return MobileServerInviteSheetResponseSchema.parse(payload);
}

/** 2a "Düzenle" — replaces the shared link with one carrying the new limits. */
export async function updateMobileServerLinkInvite(
  client: MobileApiClient,
  input: { expiresInHours: number | null; maxUses: number | null; serverId: string },
): Promise<MobileServerInviteCreateResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId: input.serverId });
  const body = MobileServerInviteLinkUpdateRequestSchema.parse({
    expiresInHours: input.expiresInHours,
    maxUses: input.maxUses,
  });
  const payload = await client.requestJson<unknown>(buildMobileServerInviteSheetPath(params), {
    body,
    method: "PUT",
  });

  return MobileServerInviteCreateResponseSchema.parse(payload);
}

/** 2a/2b "Davet et" on a person — reserves one seat for that account. */
export async function createMobileTargetedServerInvite(
  client: MobileApiClient,
  input: { serverId: string; userId: string },
): Promise<MobileServerTargetedInviteCreateResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId: input.serverId });
  const body = MobileServerTargetedInviteCreateRequestSchema.parse({ userId: input.userId });
  const payload = await client.requestJson<unknown>(buildMobileServerTargetedInvitePath(params), {
    body,
    method: "POST",
  });

  return MobileServerTargetedInviteCreateResponseSchema.parse(payload);
}

export function buildMobileInviteDeclinePath(input: { code: string }): string {
  return `/api/v1/mobile/invites/${encodeURIComponent(input.code)}/decline`;
}

/**
 * Recipient-side decline. Addressed by code, not invite id: the recipient is
 * not a member yet, so no server-scoped route is reachable for them.
 */
export async function declineMobileServerInvite(
  client: MobileApiClient,
  input: { code: string },
): Promise<MobileServerInviteDeclineResponse> {
  const params = MobileServerInviteCodeParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileInviteDeclinePath(params), {
    method: "POST",
  });

  return MobileServerInviteDeclineResponseSchema.parse(payload);
}

export async function fetchMobileServerInviteQrCode(
  client: MobileApiClient,
  input: { inviteId: string; serverId: string },
): Promise<MobileServerInviteQrResponse> {
  const params = MobileServerInviteParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerInviteQrPath(params));
  return MobileServerInviteQrResponseSchema.parse(payload);
}

export type UpdateMobileServerInput = {
  allowFileUploads?: boolean;
  allowGifs?: boolean;
  description?: string | null;
  /** S3 Section C. COMMUNITY servers reject both (`assertVisibilityFieldsWritable`). */
  discoverable?: boolean;
  isPublic?: boolean;
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

export type CreateMobileRoleInput = {
  color?: number;
  name: string;
  permissionKeys?: readonly MobilePermissionKey[];
  serverId: string;
};

export async function createMobileRole(
  client: MobileApiClient,
  input: CreateMobileRoleInput,
): Promise<MobileRoleMutationResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId: input.serverId });
  const body = MobileRoleCreateRequestSchema.parse({
    ...(input.color !== undefined ? { color: input.color } : {}),
    name: input.name,
    permissionKeys: input.permissionKeys ?? [],
  });
  const payload = await client.requestJson<unknown>(buildMobileServerRolesPath(params), {
    body,
    method: "POST",
  });
  return MobileRoleMutationResponseSchema.parse(payload);
}

export type UpdateMobileRoleInput = {
  color?: number;
  name?: string;
  permissionKeys?: readonly MobilePermissionKey[];
  roleId: string;
  serverId: string;
};

export async function updateMobileRole(
  client: MobileApiClient,
  input: UpdateMobileRoleInput,
): Promise<MobileRoleMutationResponse> {
  const params = MobileServerRoleParamsSchema.parse({
    roleId: input.roleId,
    serverId: input.serverId,
  });
  const body = MobileRoleUpdateRequestSchema.parse({
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.permissionKeys !== undefined ? { permissionKeys: input.permissionKeys } : {}),
  });
  const payload = await client.requestJson<unknown>(buildMobileServerRolePath(params), {
    body,
    method: "PATCH",
  });
  return MobileRoleMutationResponseSchema.parse(payload);
}

export async function deleteMobileRole(
  client: MobileApiClient,
  input: { roleId: string; serverId: string },
): Promise<MobileMutationSuccessResponse> {
  const params = MobileServerRoleParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerRolePath(params), {
    method: "DELETE",
  });
  return MobileMutationSuccessResponseSchema.parse(payload);
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
