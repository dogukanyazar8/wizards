// Relative rather than aliased: see the sibling preview route.
import { groupInviteJoinRoute } from "../../../dm/groups/invite-route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return groupInviteJoinRoute(request, code);
}
