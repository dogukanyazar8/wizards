"use client";

import {
  AppAwaitingResponseSchema,
  AppRecentResponseSchema,
  AppSummaryResponseSchema,
  EventsUpcomingResponseSchema,
  PresenceUpdateResponseSchema,
  SearchCommandResponseSchema,
  ServerJoinByInviteResponseSchema,
  VoiceLiveResponseSchema,
  type AppAwaitingResponse,
  type AppRecentResponse,
  type AppSummaryResponse,
  type AppAwaitingFilter,
  type EventsUpcomingResponse,
  type PresenceUpdateBody,
  type PresenceUpdateResponse,
  type SearchCommandResponse,
  type ServerJoinByInviteResponse,
  type VoiceLiveResponse,
} from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 3 §5. The client half of the data contract.
 *
 * Every response is parsed with the same schema the route validated it against,
 * so an unvalidated JSON object never reaches a component. A payload that drifts
 * fails loudly here instead of rendering `undefined` three layers down.
 *
 * There is no polling anywhere in this file. Freshness comes from
 * `useHomeRealtime`, which patches or invalidates on the socket events that
 * already exist.
 */

export class HomeClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HomeClientError";
  }
}

export const homeQueryKeys = {
  /**
   * Faz 6 §6 — the source is part of the key because it is part of the request.
   * One key across chips would show the previous chip's rows while the new one
   * loads and count them as if they matched.
   */
  awaiting: (limit: number, source: AppAwaitingFilter = "all") =>
    ["home", "awaiting", limit, source] as const,
  commandSearch: (q: string) => ["home", "command-search", q] as const,
  live: (limit: number) => ["home", "live", limit] as const,
  recent: (limit: number) => ["home", "recent", limit] as const,
  root: ["home"] as const,
  summary: ["home", "summary"] as const,
  upcoming: (limit: number) => ["home", "upcoming", limit] as const,
  upcomingPrefix: ["home", "upcoming"] as const,
};

/** §5. Socket events do the refreshing; these only bound a re-focus refetch. */
export const HOME_STALE_TIME_MS = {
  awaiting: 20_000,
  live: 10_000,
  recent: 20_000,
  summary: 30_000,
  upcoming: 60_000,
} as const;

type ErrorPayload = { code?: string; error?: string };

async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const details: ErrorPayload =
      typeof payload === "object" && payload !== null ? (payload as ErrorPayload) : {};
    throw new HomeClientError(details.error ?? "Request failed", response.status, details.code);
  }

  return payload;
}

export async function fetchHomeSummary(): Promise<AppSummaryResponse> {
  return AppSummaryResponseSchema.parse(await requestJson("/api/v1/app/summary"));
}

export async function fetchHomeRecent(limit: number): Promise<AppRecentResponse> {
  return AppRecentResponseSchema.parse(
    await requestJson(`/api/v1/app/recent?limit=${encodeURIComponent(limit)}`),
  );
}

export async function fetchHomeAwaiting(
  limit: number,
  source: AppAwaitingFilter = "all",
): Promise<AppAwaitingResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (source !== "all") {
    params.set("source", source);
  }

  return AppAwaitingResponseSchema.parse(
    await requestJson(`/api/v1/app/awaiting?${params.toString()}`),
  );
}

export async function fetchHomeLiveRooms(limit: number): Promise<VoiceLiveResponse> {
  return VoiceLiveResponseSchema.parse(
    await requestJson(`/api/v1/voice/live?limit=${encodeURIComponent(limit)}`),
  );
}

export async function fetchHomeUpcomingEvents(limit: number): Promise<EventsUpcomingResponse> {
  return EventsUpcomingResponseSchema.parse(
    await requestJson(`/api/v1/events/upcoming?limit=${encodeURIComponent(limit)}`),
  );
}

export async function fetchHomeCommandSearch(q: string): Promise<SearchCommandResponse> {
  return SearchCommandResponseSchema.parse(
    await requestJson(`/api/v1/search/command?q=${encodeURIComponent(q)}`),
  );
}

export async function updateHomePresence(
  body: PresenceUpdateBody,
): Promise<PresenceUpdateResponse> {
  return PresenceUpdateResponseSchema.parse(
    await requestJson("/api/v1/users/me/presence", {
      body: JSON.stringify(body),
      method: "PATCH",
    }),
  );
}

export async function joinServerByInvite(inviteCode: string): Promise<ServerJoinByInviteResponse> {
  return ServerJoinByInviteResponseSchema.parse(
    await requestJson("/api/v1/servers/join", {
      body: JSON.stringify({ inviteCode }),
      method: "POST",
    }),
  );
}

/**
 * `POST /api/v1/servers/[serverId]/events/[eventId]/interest`. The body carries
 * the desired state rather than a toggle, so two racing taps converge instead of
 * cancelling out — the route's own comment says the same thing from its side.
 */
export async function setHomeEventInterest(input: {
  eventId: string;
  interested: boolean;
  serverId: string;
}): Promise<void> {
  await requestJson(
    `/api/v1/servers/${encodeURIComponent(input.serverId)}/events/${encodeURIComponent(
      input.eventId,
    )}/interest`,
    { body: JSON.stringify({ interested: input.interested }), method: "POST" },
  );
}
