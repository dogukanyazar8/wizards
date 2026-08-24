import { mentionContextRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ mentionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { mentionId } = await context.params;
  return mentionContextRoute(request, mentionId);
}
