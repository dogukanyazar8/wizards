import { pollReadRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await context.params;
  return pollReadRoute(request, pollId);
}
