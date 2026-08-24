import { eventReminderRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ eventId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const { eventId } = await context.params;
  return eventReminderRoute(request, eventId);
}
