// Relative rather than aliased on purpose: `route-contract.test.ts` resolves a
// route's logic module by path, and an alias hides the auth guard from it.
import { groupInvitePreviewRoute } from "../../../dm/groups/invite-route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return groupInvitePreviewRoute(request, code);
}
