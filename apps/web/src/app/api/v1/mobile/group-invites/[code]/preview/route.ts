// Relative rather than aliased: see the web twin.
import { mobileGroupInvitePreviewRoute } from "../../../dm/groups/invite-route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return mobileGroupInvitePreviewRoute(request, code);
}
