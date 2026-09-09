import { TransferServerOwnershipSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { transferServerOwnership } from "@/lib/workspace/server-ownership-service";

export type TransferServerOwnershipRouteContext = {
  params: Promise<{ serverId: string }>;
};

export type TransferServerOwnershipRouteDependencies = {
  enforceApiRateLimit: typeof enforceApiRateLimit;
  jsonError: typeof jsonError;
  parseJsonBody: typeof parseJsonBody;
  requireApiUserId: typeof requireApiUserId;
  transferServerOwnership: typeof transferServerOwnership;
};

const defaultDependencies: TransferServerOwnershipRouteDependencies = {
  enforceApiRateLimit,
  jsonError,
  parseJsonBody,
  requireApiUserId,
  transferServerOwnership,
};

/**
 * Ş1 §3. Shares the `server:update` budget rather than opening a new one: this
 * is the owner writing a server column, and a second budget would let a caller
 * spend one limit to work around the other.
 */
export async function transferServerOwnershipRoute(
  request: Request,
  context: TransferServerOwnershipRouteContext,
  dependencies: TransferServerOwnershipRouteDependencies = defaultDependencies,
) {
  try {
    const actorId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(actorId, "server:update");
    const { serverId } = await context.params;
    const input = await dependencies.parseJsonBody(request, TransferServerOwnershipSchema);
    const result = await dependencies.transferServerOwnership(actorId, serverId, input);

    return Response.json(result);
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
