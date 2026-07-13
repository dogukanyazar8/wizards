import {
  MobileServerCreateRequestSchema,
  MobileServerCreateResponseSchema,
  MobileServerIdParamsSchema,
  MobileServerInviteCreateRequestSchema,
  MobileServerInviteCreateResponseSchema,
  MobileServerJoinRequestSchema,
  MobileServerJoinResponseSchema,
  type MobileServerCreateRequest,
  type MobileServerCreateResponse,
  type MobileServerInviteCreateRequest,
  type MobileServerInviteCreateResponse,
  type MobileServerJoinRequest,
  type MobileServerJoinResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";

export function buildMobileServerCreatePath(): string {
  return "/api/v1/mobile/servers";
}

export function buildMobileServerJoinPath(): string {
  return "/api/v1/mobile/servers/join";
}

export function buildMobileServerInviteCreatePath(input: { serverId: string }): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(input.serverId)}/invites`;
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

export async function createMobileServerInvite(
  client: MobileApiClient,
  serverId: string,
  input: MobileServerInviteCreateRequest,
): Promise<MobileServerInviteCreateResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId });
  const body = MobileServerInviteCreateRequestSchema.parse(input);
  const payload = await client.requestJson<unknown>(
    buildMobileServerInviteCreatePath(params),
    {
      body,
      method: "POST",
    },
  );

  return MobileServerInviteCreateResponseSchema.parse(payload);
}
