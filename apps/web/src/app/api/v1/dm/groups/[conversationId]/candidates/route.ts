// The import is **relative**, and it has to stay that way. `route-contract.test.ts`
// finds a route's logic file by resolving every import ending in `route-logic`
// against the route's own directory (`path.resolve(routeDirectory, …)`). An
// `@/app/api/...` alias resolves to a path that does not exist, the file is skipped
// in silence, and the endpoint drops into the "route with no auth gate" list with no
// visible cause. Two Dalga 1 stripes hit this; see `raporlar/03-rapor.md` §5.2b.
import { groupInviteCandidatesRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** SPEC-MESAJLAR §16 — the add-members modal's `ARKADAŞLARIN` list. */
export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return groupInviteCandidatesRoute(request, conversationId);
}
