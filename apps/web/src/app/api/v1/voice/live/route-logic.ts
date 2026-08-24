import { prisma } from "@wizards/db";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";

import { listHomeLiveRooms, readGroupCallStatesFromRedis } from "@/lib/home/live-service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";
import { readHomePresenceState } from "@/lib/home/service";
import {
  VoiceLiveQuerySchema,
  VoiceLiveResponseSchema,
  type VoiceLiveResponse,
} from "@/lib/home/types";

export type VoiceLiveRouteDependencies = HomeRouteContext & {
  listRooms: (userId: string, limit: number) => Promise<VoiceLiveResponse>;
};

export const defaultVoiceLiveDependencies: VoiceLiveRouteDependencies = {
  // Named here rather than shared from the runner so the route contract can
  // see the guard on the route itself (`route-contract.test.ts`).
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listRooms: (userId, limit) =>
    listHomeLiveRooms(userId, limit, {
      database: prisma,
      now: new Date(),
      readCallStates: readGroupCallStatesFromRedis,
      readPresence: readHomePresenceState,
    }),
};

export async function voiceLiveRoute(
  request: Request,
  dependencies: VoiceLiveRouteDependencies = defaultVoiceLiveDependencies,
) {
  return runHomeRoute("voice:live:list", dependencies, async (userId) => {
    const params = readSearchParams(request);
    const query = VoiceLiveQuerySchema.parse({ limit: optionalParam(params, "limit") });

    return VoiceLiveResponseSchema.parse(await dependencies.listRooms(userId, query.limit));
  });
}
