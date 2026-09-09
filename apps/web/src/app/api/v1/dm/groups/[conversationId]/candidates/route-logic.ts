import { z } from "zod";
import type { InviteCandidatePage } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { listInviteCandidates, type ListInviteCandidatesOptions } from "@/lib/dm/invite-candidates";

/**
 * SPEC-MESAJLAR §16 — `GET /api/v1/dm/groups/[conversationId]/candidates`.
 *
 * Its own `route-logic.ts`, inside the `candidates` folder, rather than four more
 * exports in `dm/groups/route-logic.ts`: that file belongs to Ş2 and this endpoint has
 * a different dependency set. The folder placement is also what keeps
 * `route-contract.test.ts` able to see the auth gate — see the note on the route file.
 *
 * Order is kural 8's: `requireApiUserId` → `enforceApiRateLimit` → zod → permission →
 * work. The permission half lives in `requireInviteCandidateContext`, one layer down,
 * so the same gate runs for any other caller of the service.
 */

export const InviteCandidateParamsSchema = z
  .object({ conversationId: z.string().trim().min(1).max(128) })
  .strict();

export const InviteCandidateQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(512).nullable().default(null),
    limit: z.coerce.number().int().positive().max(250).nullable().default(null),
    /**
     * Trimmed but not lower-cased here: the fold is Turkish-locale aware and belongs
     * next to the comparison it feeds, not in a schema that cannot see it.
     */
    query: z.string().trim().max(128).nullable().default(null),
  })
  .strict();

export type InviteCandidateRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  listCandidates(
    viewerId: string,
    conversationId: string,
    options: ListInviteCandidatesOptions,
  ): Promise<InviteCandidatePage>;
  /**
   * Carried as data so the mobile twin — when K1's parity endpoint is written — swaps
   * its own bucket without a second copy of the handler.
   *
   * A candidate list is a *search* surface: it is typed into, so it fires far more
   * often than a panel open, and it reads the friend graph rather than one
   * conversation. That is why it has its own bucket rather than sharing the panel's.
   */
  rateLimits: { read: ApiRateLimitAction };
};

export const inviteCandidateDefaults: InviteCandidateRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listCandidates: (viewerId, conversationId, options) =>
    listInviteCandidates(viewerId, conversationId, options),
  rateLimits: { read: "dm:group:candidates" },
};

/**
 * §16's `ARKADAŞLARIN` list. Existing members are filtered out **before** the page is
 * cut, so `nextCursor` and the row count always describe the same list the user sees.
 */
export async function groupInviteCandidatesRoute(
  request: Request,
  conversationId: string,
  dependencies: InviteCandidateRouteDependencies = inviteCandidateDefaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, dependencies.rateLimits.read);
    const params = InviteCandidateParamsSchema.parse({ conversationId });
    const url = new URL(request.url);
    const query = InviteCandidateQuerySchema.parse({
      cursor: url.searchParams.get("cursor"),
      limit: url.searchParams.get("limit"),
      query: url.searchParams.get("query"),
    });
    const page = await dependencies.listCandidates(userId, params.conversationId, {
      cursor: query.cursor,
      limit: query.limit,
      query: query.query,
    });

    return Response.json(page);
  } catch (error) {
    return jsonError(error);
  }
}
