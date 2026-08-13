import { ServerDiscoveryPageSchema, ServerDiscoveryQuerySchema } from "@wizards/types";

import { auth } from "@/auth";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { createNetworkRateLimitIdentity } from "@/lib/security/client-ip";
import { listDiscoverableServers } from "@/lib/servers/server-discovery-service";

export type ServerDiscoverRouteDependencies = {
  enforceRateLimit(key: string, action: "server:discover"): Promise<void>;
  listServers: typeof listDiscoverableServers;
  resolveViewerId(request: Request): Promise<string | null>;
};

/**
 * Same anonymous-read stance as the S2 profile card
 * (servers/[serverId]/profile/route-logic.ts): browsing public, discoverable
 * servers does not require a session. A signed-in caller is still
 * rate-limited by their own id; an anonymous one falls back to a hashed
 * client-IP identity, the same helper the profile route and the OTA manifest
 * route use for their own unauthenticated traffic.
 */
async function resolveSessionViewerId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const defaultDependencies: ServerDiscoverRouteDependencies = {
  enforceRateLimit: enforceApiRateLimit,
  listServers: listDiscoverableServers,
  resolveViewerId: resolveSessionViewerId,
};

export async function serverDiscoverRoute(
  request: Request,
  dependencies: ServerDiscoverRouteDependencies = defaultDependencies,
) {
  try {
    const viewerId = await dependencies.resolveViewerId(request);
    const rateLimitKey =
      viewerId ??
      createNetworkRateLimitIdentity({
        headers: request.headers,
      });
    await dependencies.enforceRateLimit(rateLimitKey, "server:discover");

    const query = ServerDiscoveryQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const page = await dependencies.listServers({
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.query === undefined ? {} : { query: query.query }),
    });

    return Response.json(ServerDiscoveryPageSchema.parse(page));
  } catch (error) {
    return jsonError(error);
  }
}
