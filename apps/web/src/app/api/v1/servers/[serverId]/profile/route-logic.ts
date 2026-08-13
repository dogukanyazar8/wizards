import { ServerPublicProfileSchema } from "@wizards/types";

import { auth } from "@/auth";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { createNetworkRateLimitIdentity } from "@/lib/security/client-ip";
import { getVisibleServerPublicProfile } from "@/lib/servers/server-public-profile-service";

export type ServerProfileRouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export type ServerProfileRouteDependencies = {
  enforceRateLimit(key: string, action: "server:profile"): Promise<void>;
  getProfile: typeof getVisibleServerPublicProfile;
  resolveViewerId(request: Request): Promise<string | null>;
};

/**
 * The profile card is readable without a session (S2 binding decision: "Web
 * tüketicisi. Oturum varsa viewerId geçilir, yoksa null") — unlike the
 * mobile route, which always carries a Bearer session. `auth()` is read
 * directly instead of through `requireApiUserId`, which throws on a missing
 * session and would make that branch unreachable.
 */
async function resolveSessionViewerId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const defaultDependencies: ServerProfileRouteDependencies = {
  enforceRateLimit: enforceApiRateLimit,
  getProfile: getVisibleServerPublicProfile,
  resolveViewerId: resolveSessionViewerId,
};

export async function serverProfileRoute(
  request: Request,
  context: ServerProfileRouteContext,
  dependencies: ServerProfileRouteDependencies = defaultDependencies,
) {
  try {
    const viewerId = await dependencies.resolveViewerId(request);
    // A signed-in caller is rate-limited by their own id, same as every
    // other server route. An anonymous caller has none, so the budget falls
    // back to a hashed client IP identity — the same helper the OTA manifest
    // route uses for its own unauthenticated traffic.
    const rateLimitKey =
      viewerId ??
      createNetworkRateLimitIdentity({
        headers: request.headers,
      });
    await dependencies.enforceRateLimit(rateLimitKey, "server:profile");
    const { serverId } = await context.params;
    const profile = await dependencies.getProfile(serverId, viewerId);

    return Response.json(ServerPublicProfileSchema.parse(profile));
  } catch (error) {
    return jsonError(error);
  }
}
