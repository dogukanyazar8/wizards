import {
  ServerDiscoveryPageSchema,
  ServerPublicProfileSchema,
  type ServerDiscoveryPage,
  type ServerPublicProfile,
} from "@wizards/types";

export class ServerProfileClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ServerProfileClientError";
  }
}

export const serverProfileQueryKeys = {
  profile: (serverId: string) => ["server-profile", serverId] as const,
};

/**
 * Client-side counterpart to `GET /api/v1/servers/[serverId]/profile`
 * (Section A). A 404 here means "not found or not visible to this viewer" —
 * the route never distinguishes the two, so neither does this.
 */
export async function fetchServerPublicProfile(serverId: string): Promise<ServerPublicProfile> {
  const response = await fetch(`/api/v1/servers/${encodeURIComponent(serverId)}/profile`);
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new ServerProfileClientError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.code,
    );
  }

  return ServerPublicProfileSchema.parse(payload);
}

/**
 * Shared by the discovery list fetch and the invite-free join mutation
 * (S3 Bölüm A/B): both hang off `/api/v1/servers/discover` and
 * `/api/v1/servers/[serverId]/join`, the same status/code envelope
 * `jsonError` always produces, and both are consumed exclusively by the
 * discover screen — a third, near-identical error class per call would just
 * duplicate this one.
 */
export class ServerDiscoveryClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ServerDiscoveryClientError";
  }
}

export const serverDiscoveryQueryKeys = {
  list: (query: string) => ["server-discovery", query] as const,
};

export type ServerDiscoveryPageParams = {
  cursor?: string;
  limit?: number;
  query?: string;
};

/** Client-side counterpart to `GET /api/v1/servers/discover` (S3 Bölüm A). */
export async function fetchServerDiscoveryPage(
  params: ServerDiscoveryPageParams = {},
): Promise<ServerDiscoveryPage> {
  const search = new URLSearchParams();
  if (params.cursor) {
    search.set("cursor", params.cursor);
  }
  if (params.limit) {
    search.set("limit", String(params.limit));
  }
  if (params.query) {
    search.set("query", params.query);
  }

  const queryString = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetch(`/api/v1/servers/discover${queryString}`);
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new ServerDiscoveryClientError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.code,
    );
  }

  return ServerDiscoveryPageSchema.parse(payload);
}

/**
 * Client-side counterpart to `POST /api/v1/servers/[serverId]/join`
 * (S3 Bölüm B). Bodyless, like the route itself.
 */
export async function joinPublicServerRequest(serverId: string): Promise<{ success: true }> {
  const response = await fetch(`/api/v1/servers/${encodeURIComponent(serverId)}/join`, {
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    error?: string;
    success?: boolean;
  } | null;

  if (!response.ok) {
    throw new ServerDiscoveryClientError(
      payload?.error ?? "Request failed",
      response.status,
      payload?.code,
    );
  }

  return { success: true };
}
