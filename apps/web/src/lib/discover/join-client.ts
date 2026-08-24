"use client";

import { isCancelledError } from "@tanstack/react-query";
import { z } from "zod";

import { discoverQueryKeys } from "@/lib/discover/client";
import { resolveServerJoinErrorMessageKey } from "@/lib/servers/discovery-presentation";
import { ServerDiscoveryClientError } from "@/lib/servers/client";
import { workspaceQueryKeys } from "@/lib/workspace/client";

const JoinResponseSchema = z.object({
  name: z.string().min(1),
  serverId: z.string().min(1),
});

const ErrorPayloadSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Invite rows are eight characters, while server vanity codes may be longer.
 * The modal contract explicitly rejects a 60-character value; 32 keeps vanity
 * slugs usable without accepting an effectively unbounded path token.
 */
const MAX_DISCOVER_INVITE_CODE_LENGTH = 32;
const INVITE_CODE_PATTERN = /^[A-Za-z0-9]+$/u;
const DISCOVER_SERVER_QUERY_ROOT = ["discover", "servers"] as const;

// TODO(api): invite/public self-join emits only the broad `server:settings:updated` event.
// There is no membership-added event for this path to invalidate Keşfet safely; keep the
// client on its own successful mutation until the API publishes a real membership event.

function validCode(value: string) {
  return (
    value.length > 0 &&
    value.length <= MAX_DISCOVER_INVITE_CODE_LENGTH &&
    INVITE_CODE_PATTERN.test(value)
  );
}

export function parseInviteCode(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/u.test(value) || value.includes("?") || value.includes("#")) {
    return null;
  }
  if (validCode(value)) {
    return value;
  }

  const whisprPrefixed = /^whispr\.app\//iu.test(value);
  let parsed: URL;
  try {
    parsed = new URL(whisprPrefixed ? `https://${value}` : value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.search || parsed.hash) {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const code =
    whisprPrefixed && parsed.hostname.toLowerCase() === "whispr.app" && segments.length === 1
      ? segments[0]
      : segments.length === 2 && segments[0] === "invite"
        ? segments[1]
        : null;
  return code && validCode(code) ? code : null;
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ErrorPayloadSchema.safeParse(payload);
    throw new ServerDiscoveryClientError(
      parsed.success ? (parsed.data.error ?? "Request failed") : "Request failed",
      response.status,
      parsed.success ? parsed.data.code : undefined,
    );
  }
  return payload;
}

export async function joinDiscoverServer(
  serverId: string,
): Promise<{ serverId: string; name: string }> {
  return JoinResponseSchema.parse(
    await requestJson(`/api/v1/servers/${encodeURIComponent(serverId)}/join`, {
      method: "POST",
    }),
  );
}

export async function leaveDiscoverServer(serverId: string): Promise<void> {
  await requestJson(`/api/v1/servers/${encodeURIComponent(serverId)}/members/me`, {
    method: "DELETE",
  });
}

export async function redeemDiscoverInvite(
  rawCode: string,
): Promise<{ serverId: string; name: string }> {
  const inviteCode = parseInviteCode(rawCode);
  if (!inviteCode) {
    throw new ServerDiscoveryClientError("Invalid invite code", 400, "INVALID_INVITE_CODE");
  }

  return JoinResponseSchema.parse(
    await requestJson("/api/v1/servers/join", {
      body: JSON.stringify({ inviteCode }),
      method: "POST",
    }),
  );
}

export function resolveDiscoverJoinErrorMessageKey(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return resolveServerJoinErrorMessageKey(typeof code === "string" ? code : undefined);
}

export type DiscoverMembershipQueryClient = {
  invalidateQueries(
    filters: { queryKey: readonly unknown[] },
    options?: { cancelRefetch?: boolean },
  ): Promise<unknown>;
  setQueryData(queryKey: readonly unknown[], updater: (old: unknown) => unknown): unknown;
};

function isQueryRefreshCancellation(error: unknown): boolean {
  if (isCancelledError(error)) {
    return true;
  }

  // Multiple React/query-core module instances can make `instanceof`-based
  // cancellation checks fail. TanStack's cancellation object owns these two
  // markers; require both so an unrelated Error("CancelledError") is not lost.
  return (
    error instanceof Error &&
    error.message === "CancelledError" &&
    Object.hasOwn(error, "revert") &&
    Object.hasOwn(error, "silent")
  );
}

async function tolerateSupersededQueryRefresh(refresh: () => Promise<unknown>): Promise<void> {
  try {
    await refresh();
  } catch (error) {
    if (!isQueryRefreshCancellation(error)) {
      throw error;
    }
  }
}

/** One mutation onSuccess boundary for the shell list, grid cards, and profile panel. */
export async function applyDiscoverMembershipSuccess(
  queryClient: DiscoverMembershipQueryClient,
  serverId: string,
  joined: boolean,
) {
  queryClient.setQueryData(discoverQueryKeys.profile(serverId), (old) =>
    typeof old === "object" && old !== null ? { ...old, joined } : old,
  );
  await Promise.all([
    tolerateSupersededQueryRefresh(() =>
      queryClient.invalidateQueries(
        { queryKey: workspaceQueryKeys.servers },
        { cancelRefetch: false },
      ),
    ),
    tolerateSupersededQueryRefresh(() =>
      queryClient.invalidateQueries(
        { queryKey: DISCOVER_SERVER_QUERY_ROOT },
        { cancelRefetch: false },
      ),
    ),
  ]);
}
