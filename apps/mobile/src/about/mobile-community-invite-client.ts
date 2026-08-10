import {
  CreateServerScheduledEventSchema,
  MobileInvitePreviewResponseSchema,
  MobileMutationSuccessResponseSchema,
  MobileServerEventParamsSchema,
  MobileServerIdParamsSchema,
  MobileServerScheduledEventResponseSchema,
  MobileServerScheduledEventsResponseSchema,
  MobileServerUserSettingsResponseSchema,
  ServerPublicProfileSchema,
  SetServerScheduledEventInterestSchema,
  UpdateServerScheduledEventSchema,
  UpdateServerUserSettingsSchema,
  type CreateServerScheduledEventInput,
  type MobileInvitePreviewResponse,
  type MobileServerJoinResponse,
  type MobileServerScheduledEventResponse,
  type MobileServerScheduledEventsResponse,
  type MobileServerUserSettingsResponse,
  type ServerPublicProfile,
  type UpdateServerScheduledEventInput,
  type UpdateServerUserSettingsInput,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { joinMobileServer } from "../workspace/mobile-server-management-client";

export function buildMobileCommunityInvitePreviewPath(slug: string): string {
  return `/api/v1/mobile/invites/${encodeURIComponent(slug)}/preview`;
}

export function buildMobileCommunityInviteUrl(webUrl: string, slug: string): string {
  return new URL(`/invite/${encodeURIComponent(slug)}`, webUrl).toString();
}

export async function fetchMobileCommunityInvitePreview(
  client: MobileApiClient,
  slug: string,
): Promise<MobileInvitePreviewResponse> {
  const payload = await client.requestJson<unknown>(buildMobileCommunityInvitePreviewPath(slug), {
    method: "GET",
  });
  return MobileInvitePreviewResponseSchema.parse(payload);
}

/** Uses the established server join mutation; 2g adds no second join endpoint. */
export function joinMobileCommunityServer(
  client: MobileApiClient,
  slug: string,
): Promise<MobileServerJoinResponse> {
  return joinMobileServer(client, { inviteCode: slug });
}

/**
 * S2 Section D's second data source for the same 2g body: a member reached
 * this from `ServerSettings`/`ServerMembers` (a `serverId`, not an invite
 * code), so the fetch hits the server-scoped profile route the S2 Section A
 * pass already shipped rather than the invite-preview route above.
 */
export function buildMobileServerProfilePath(serverId: string): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(serverId)}/profile`;
}

/**
 * The share/copy target for a server-sourced profile card. There is no
 * invite code to reuse `buildMobileCommunityInviteUrl` with, so this points
 * at the web route S2 binding decision 5 names (`/(main)/servers/[serverId]/about`)
 * instead of inventing a new one.
 */
export function buildMobileServerProfileUrl(webUrl: string, serverId: string): string {
  return new URL(`/servers/${encodeURIComponent(serverId)}/about`, webUrl).toString();
}

export async function fetchMobileServerProfile(
  client: MobileApiClient,
  serverId: string,
): Promise<ServerPublicProfile> {
  const payload = await client.requestJson<unknown>(buildMobileServerProfilePath(serverId), {
    method: "GET",
  });
  return ServerPublicProfileSchema.parse(payload);
}

/* -------------------------------------------------------------------------- */
/* Sunucular 6c/6d/6e — user settings and scheduled events (Faz 1 §B3/§B5)     */
/* -------------------------------------------------------------------------- */

export function buildMobileServerUserSettingsPath(serverId: string): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(serverId)}/settings`;
}

export function buildMobileServerEventsPath(serverId: string): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(serverId)}/events`;
}

export function buildMobileServerEventPath(serverId: string, eventId: string): string {
  return `${buildMobileServerEventsPath(serverId)}/${encodeURIComponent(eventId)}`;
}

export function buildMobileServerEventInterestPath(serverId: string, eventId: string): string {
  return `${buildMobileServerEventPath(serverId, eventId)}/interest`;
}

/**
 * 6c writes `starred`, `muted` and `notificationLevel` through this one endpoint
 * (Faz 1 binding decision 3) — Faz 4 may not open a switch-per-endpoint.
 *
 * Invalidation contract for the callers: this changes `serverProfile(serverId)`
 * *and* the server list, because the rail's order depends on `starred`.
 */
export async function updateMobileServerUserSettings(
  client: MobileApiClient,
  serverId: string,
  patch: UpdateServerUserSettingsInput,
): Promise<MobileServerUserSettingsResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId });
  const body = UpdateServerUserSettingsSchema.parse(patch);
  const payload = await client.requestJson<unknown>(
    buildMobileServerUserSettingsPath(params.serverId),
    { body, method: "PATCH" },
  );

  return MobileServerUserSettingsResponseSchema.parse(payload);
}

/** Without `includePast` the route returns only `SCHEDULED`/`ACTIVE` events. */
export async function fetchMobileServerEvents(
  client: MobileApiClient,
  serverId: string,
  options: { readonly includePast?: boolean } = {},
): Promise<MobileServerScheduledEventsResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId });
  // The query schema is strict, so an unset flag must be an absent parameter
  // rather than `includePast=false`.
  const path =
    options.includePast === true
      ? `${buildMobileServerEventsPath(params.serverId)}?includePast=true`
      : buildMobileServerEventsPath(params.serverId);
  const payload = await client.requestJson<unknown>(path);

  return MobileServerScheduledEventsResponseSchema.parse(payload);
}

export async function createMobileServerEvent(
  client: MobileApiClient,
  serverId: string,
  input: CreateServerScheduledEventInput,
): Promise<MobileServerScheduledEventResponse> {
  const params = MobileServerIdParamsSchema.parse({ serverId });
  const body = CreateServerScheduledEventSchema.parse(input);
  const payload = await client.requestJson<unknown>(buildMobileServerEventsPath(params.serverId), {
    body,
    method: "POST",
  });

  return MobileServerScheduledEventResponseSchema.parse(payload);
}

export async function updateMobileServerEvent(
  client: MobileApiClient,
  input: { readonly eventId: string; readonly serverId: string },
  patch: UpdateServerScheduledEventInput,
): Promise<MobileServerScheduledEventResponse> {
  const params = MobileServerEventParamsSchema.parse(input);
  const body = UpdateServerScheduledEventSchema.parse(patch);
  const payload = await client.requestJson<unknown>(
    buildMobileServerEventPath(params.serverId, params.eventId),
    { body, method: "PATCH" },
  );

  return MobileServerScheduledEventResponseSchema.parse(payload);
}

/**
 * Cancelling never deletes the row (Faz 1 binding decision 7): the response is
 * the same event carrying `status: "CANCELLED"`, so the caller replaces rather
 * than removes it.
 */
export async function cancelMobileServerEvent(
  client: MobileApiClient,
  input: { readonly eventId: string; readonly serverId: string },
): Promise<MobileServerScheduledEventResponse> {
  const params = MobileServerEventParamsSchema.parse(input);
  const payload = await client.requestJson<unknown>(
    buildMobileServerEventPath(params.serverId, params.eventId),
    { method: "DELETE" },
  );

  return MobileServerScheduledEventResponseSchema.parse(payload);
}

/**
 * The body carries the desired state, not a toggle (Faz 1 binding decision 8),
 * so two taps racing each other cannot cancel out.
 */
export async function setMobileServerEventInterest(
  client: MobileApiClient,
  input: { readonly eventId: string; readonly serverId: string },
  interested: boolean,
): Promise<MobileServerScheduledEventResponse> {
  const params = MobileServerEventParamsSchema.parse(input);
  const body = SetServerScheduledEventInterestSchema.parse({ interested });
  const payload = await client.requestJson<unknown>(
    buildMobileServerEventInterestPath(params.serverId, params.eventId),
    { body, method: "POST" },
  );

  return MobileServerScheduledEventResponseSchema.parse(payload);
}

export function buildMobilePublicServerJoinPath(serverId: string): string {
  return `/api/v1/mobile/servers/${encodeURIComponent(serverId)}/join`;
}

/**
 * S3 Section B's invite-free join, the same endpoint the web profile card
 * calls. Bodyless by contract, so nothing is serialised into the request.
 */
export async function joinMobilePublicServer(
  client: MobileApiClient,
  serverId: string,
): Promise<void> {
  const payload = await client.requestJson<unknown>(buildMobilePublicServerJoinPath(serverId), {
    method: "POST",
  });
  MobileMutationSuccessResponseSchema.parse(payload);
}

export type MobileServerJoinErrorCopyKey =
  "communityJoinFailed" | "discoverJoinBanned" | "discoverJoinFull" | "discoverJoinUnavailable";

/**
 * Mirrors the web card's `resolveServerJoinErrorMessageKey`, so both clients
 * report the same three known failures with their own honest text. A 404
 * stays deliberately undifferentiated: the route hides a private server's
 * existence behind the same status as a missing one, and this must not invent
 * a distinction the backend refuses to make. Anything unmapped falls back to
 * the generic "could not join" line the invite path already uses.
 */
export function resolveMobileServerJoinErrorCopyKey(
  serverCode: string | null | undefined,
): MobileServerJoinErrorCopyKey {
  switch (serverCode) {
    case "SERVER_BANNED":
      return "discoverJoinBanned";
    case "SERVER_FULL":
      return "discoverJoinFull";
    case "SERVER_NOT_FOUND":
      return "discoverJoinUnavailable";
    default:
      return "communityJoinFailed";
  }
}
