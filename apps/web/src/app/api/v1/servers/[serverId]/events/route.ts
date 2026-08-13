import { CreateServerScheduledEventSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  createServerScheduledEvent,
  listServerScheduledEvents,
} from "@/lib/workspace/scheduled-event-service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:events:list");
    const { serverId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const includePast = searchParams.get("includePast") === "true";
    const cursor = searchParams.get("cursor") ?? undefined;
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
    const events = await listServerScheduledEvents(serverId, userId, {
      ...(cursor ? { cursor } : {}),
      includePast,
      limit,
    });

    return Response.json({ events });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:events:create");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, CreateServerScheduledEventSchema);
    const event = await createServerScheduledEvent(userId, serverId, input);

    return Response.json({ event }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
