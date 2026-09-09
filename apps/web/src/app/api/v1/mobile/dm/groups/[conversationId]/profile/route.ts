import { GroupProfilePanelDTOSchema } from "@wizards/types";

// Relative, not the `@/app/...` alias: `route-contract.test.ts` finds a route's
// logic file by resolving every import that ends in `route-logic` **against the
// route's own directory**. An alias resolves to nothing, the file is silently
// skipped, and the endpoint drifts into the "no auth guard" list without anybody
// being told why.
import {
  groupProfileDefaults,
  groupProfileRoute,
  type GroupProfileRouteDependencies,
} from "../../../../../dm/groups/route-logic";
import { requireMobileApiUserId } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * K1. The mobile twin of §15's group read: same service, same schema, its own
 * bearer authentication and its own rate-limit bucket.
 *
 * The destructive members inherited from `groupProfileDefaults` are unreachable
 * here — this file mounts GET and nothing else. `Geçmişi temizle` and
 * `Grubu sil` have no mobile endpoint on purpose: the mobile screens are frozen
 * for this package (K1), and opening a destructive route with no surface to call
 * it would be an unguarded ability rather than a feature.
 */
const mobileDependencies: GroupProfileRouteDependencies = {
  ...groupProfileDefaults,
  authenticate: (request) => requireMobileApiUserId(request),
  rateLimits: { ...groupProfileDefaults.rateLimits, read: "mobile:dm:group:read" },
};

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  const response = await groupProfileRoute(request, conversationId, mobileDependencies);

  if (response.status !== 200) {
    return response;
  }

  // The phone is a separate release train, so the body is re-parsed against the
  // shared schema before it leaves: a server-side shape drift has to fail here,
  // not on a client that cannot be hot-fixed.
  const payload = (await response.json()) as { profile: unknown };

  return Response.json({ profile: GroupProfilePanelDTOSchema.parse(payload.profile) });
}
