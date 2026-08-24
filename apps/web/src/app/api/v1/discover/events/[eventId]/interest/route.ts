import { discoverEventInterestRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Context = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, context: Context) {
  const { eventId } = await context.params;
  return discoverEventInterestRoute(request, eventId, true);
}

export async function DELETE(request: Request, context: Context) {
  const { eventId } = await context.params;
  return discoverEventInterestRoute(request, eventId, false);
}
