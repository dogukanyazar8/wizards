import { prisma } from "@wizards/db";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { broadcastHomePresence, updateHomePresence } from "@/lib/home/presence-service";
import type { HomeRouteContext } from "@/lib/home/route-runner";
import {
  PresenceUpdateBodySchema,
  PresenceUpdateResponseSchema,
  type PresenceUpdateBody,
  type PresenceUpdateResponse,
} from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 3 §3.9. The phase's only write.
 *
 * Written out rather than run through `runHomeRoute` because the body parse has
 * to be visible on the route itself: `route-contract.test.ts` proves that every
 * mutating route reads its body through `parseJsonBody`, and a parser handed to
 * a shared runner through a closure is a parser nobody can prove.
 */

export type PresenceUpdateRouteDependencies = HomeRouteContext & {
  parseBody: (request: Request) => Promise<PresenceUpdateBody>;
  updatePresence: (userId: string, body: PresenceUpdateBody) => Promise<PresenceUpdateResponse>;
};

export const defaultPresenceUpdateDependencies: PresenceUpdateRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request) => parseJsonBody(request, PresenceUpdateBodySchema),
  updatePresence: (userId, body) =>
    updateHomePresence(userId, body, {
      broadcast: broadcastHomePresence,
      database: prisma,
      now: new Date(),
    }),
};

export async function presenceUpdateRoute(
  request: Request,
  dependencies: PresenceUpdateRouteDependencies = defaultPresenceUpdateDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "user:presence:update");
    const body = await dependencies.parseBody(request);
    const result = await dependencies.updatePresence(userId, body);

    return Response.json(PresenceUpdateResponseSchema.parse(result), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
