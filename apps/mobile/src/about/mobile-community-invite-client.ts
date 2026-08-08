import {
  MobileInvitePreviewResponseSchema,
  MobileMutationSuccessResponseSchema,
  ServerPublicProfileSchema,
  type MobileInvitePreviewResponse,
  type MobileServerJoinResponse,
  type ServerPublicProfile,
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
