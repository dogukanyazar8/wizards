import { conversationPinCreateRoute, conversationPinsListRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return conversationPinsListRoute(request, conversationId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params;
  return conversationPinCreateRoute(request, conversationId);
}
