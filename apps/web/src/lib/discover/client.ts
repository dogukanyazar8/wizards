"use client";

import {
  DiscoverCategorySchema,
  DiscoverChannelPageSchema,
  DiscoverEventPageSchema,
  DiscoverPersonPageSchema,
  DiscoverServerSchema,
  ServerPublicProfileSchema,
  type DiscoverCategoryKey,
  type DiscoverQuery,
  type ServerPublicProfile,
} from "@wizards/types";
import { z } from "zod";

const ErrorPayloadSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
});

const DiscoverServerClientPageSchema = z.object({
  categories: z.array(DiscoverCategorySchema).nullable(),
  featured: DiscoverServerSchema.nullable(),
  items: z.array(DiscoverServerSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
});

const DiscoverPersonClientPageSchema = DiscoverPersonPageSchema.extend({
  totalCount: z.number().int().nonnegative().optional(),
});

const DiscoverChannelClientPageSchema = DiscoverChannelPageSchema.extend({
  totalCount: z.number().int().nonnegative().optional(),
});

const DiscoverEventClientPageSchema = DiscoverEventPageSchema.extend({
  totalCount: z.number().int().nonnegative().optional(),
});

export type DiscoverServerClientPage = z.infer<typeof DiscoverServerClientPageSchema>;
export type DiscoverPersonClientPage = z.infer<typeof DiscoverPersonClientPageSchema>;
export type DiscoverChannelClientPage = z.infer<typeof DiscoverChannelClientPageSchema>;
export type DiscoverEventClientPage = z.infer<typeof DiscoverEventClientPageSchema>;

export class DiscoverClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "DiscoverClientError";
  }
}

async function requestJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload = ErrorPayloadSchema.safeParse(payload);
    throw new DiscoverClientError(
      errorPayload.success ? (errorPayload.data.error ?? "Request failed") : "Request failed",
      response.status,
      errorPayload.success ? errorPayload.data.code : undefined,
    );
  }

  return payload;
}

export const discoverQueryKeys = {
  root: ["discover"] as const,
  servers: (query: DiscoverQuery, limit = 24) => ["discover", "servers", query, limit] as const,
  people: (q: string) => ["discover", "people", q] as const,
  channels: (q: string, limit = 24) => ["discover", "channels", q, limit] as const,
  events: (q: string, limit = 24) => ["discover", "events", q, limit] as const,
  profile: (serverId: string) => ["discover", "profile", serverId] as const,
};

export const DISCOVER_STALE_TIME_MS = {
  servers: 60_000,
  people: 120_000,
  channels: 120_000,
  events: 120_000,
  profile: 60_000,
} as const;

const TURKISH_CATEGORY_HINTS: Readonly<Record<string, Exclude<DiscoverCategoryKey, "all">>> = {
  çalışma: "calisma",
  destek: "destek",
  iş: "is",
  kişisel: "kisisel",
  oyun: "oyun",
};

function discoverCategoryHint(q: string | undefined): Exclude<DiscoverCategoryKey, "all"> | null {
  const normalized = q?.trim().toLocaleLowerCase("tr-TR") ?? "";
  return TURKISH_CATEGORY_HINTS[normalized] ?? null;
}

function appendQuery(params: URLSearchParams, key: string, value: string | null | undefined) {
  if (value) {
    params.set(key, value);
  }
}

function appendLimit(params: URLSearchParams, limit: number) {
  params.set("limit", String(Math.min(Math.max(Math.trunc(limit), 1), 50)));
}

export async function fetchDiscoverServers(
  query: DiscoverQuery,
  cursor: string | null = null,
  limit = 24,
): Promise<DiscoverServerClientPage> {
  const params = new URLSearchParams();

  if (query.category !== "all") {
    params.set("cat", query.category);
  }
  if (query.sort !== "popular") {
    params.set("sort", query.sort);
  }
  appendQuery(params, "q", query.q);
  appendQuery(params, "catHint", discoverCategoryHint(query.q));
  appendLimit(params, limit);
  appendQuery(params, "cursor", cursor);

  const search = params.toString();
  return DiscoverServerClientPageSchema.parse(
    await requestJson(`/api/v1/discover/servers${search ? `?${search}` : ""}`),
  );
}

export async function fetchDiscoverPeople(q: string): Promise<DiscoverPersonClientPage> {
  const params = new URLSearchParams();
  appendQuery(params, "q", q);
  const search = params.toString();
  return DiscoverPersonClientPageSchema.parse(
    await requestJson(`/api/v1/discover/people${search ? `?${search}` : ""}`),
  );
}

export async function fetchDiscoverChannels(
  q: string,
  cursor: string | null = null,
  limit = 24,
): Promise<DiscoverChannelClientPage> {
  const params = new URLSearchParams();
  appendQuery(params, "q", q);
  appendLimit(params, limit);
  appendQuery(params, "cursor", cursor);
  const search = params.toString();
  return DiscoverChannelClientPageSchema.parse(
    await requestJson(`/api/v1/discover/channels${search ? `?${search}` : ""}`),
  );
}

export async function fetchDiscoverEvents(
  q: string,
  cursor: string | null = null,
  limit = 24,
): Promise<DiscoverEventClientPage> {
  const params = new URLSearchParams();
  appendQuery(params, "q", q);
  appendLimit(params, limit);
  appendQuery(params, "cursor", cursor);
  const search = params.toString();
  return DiscoverEventClientPageSchema.parse(
    await requestJson(`/api/v1/discover/events${search ? `?${search}` : ""}`),
  );
}

export async function fetchDiscoverProfile(serverId: string): Promise<ServerPublicProfile> {
  return ServerPublicProfileSchema.parse(
    await requestJson(`/api/v1/servers/${encodeURIComponent(serverId)}/profile`),
  );
}
