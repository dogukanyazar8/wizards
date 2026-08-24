import { pollVoteClearRoute, pollVoteRoute } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(request: Request, context: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await context.params;
  return pollVoteRoute(request, pollId);
}

export async function DELETE(request: Request, context: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await context.params;
  return pollVoteClearRoute(request, pollId);
}
