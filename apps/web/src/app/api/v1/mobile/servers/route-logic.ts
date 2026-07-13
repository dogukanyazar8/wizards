import { MobileServerCreateRequestSchema, MobileServerCreateResponseSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { createWorkspaceServer } from "@/lib/workspace/server-service";

type MobileServerCreateRateLimitAction = "mobile:server:create";

export type MobileServerCreateRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  createServer: typeof createWorkspaceServer;
  enforceRateLimit(userId: string, action: MobileServerCreateRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: MobileServerCreateRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  createServer: createWorkspaceServer,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

export async function mobileServerCreateRoute(
  request: Request,
  dependencies: MobileServerCreateRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:create");
    const input = await dependencies.parseBody(request, MobileServerCreateRequestSchema);
    const created = await dependencies.createServer(userId, { ...input, iconUrl: null });

    return Response.json(
      MobileServerCreateResponseSchema.parse({ server: { id: created.serverId } }),
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
