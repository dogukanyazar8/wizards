import { z } from "zod";
import { MessageSearchResponseSchema } from "@wizards/types";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { searchServerMessages } from "@/lib/messages/search-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MobileServerSearchQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
  q: z.string().trim().min(2).max(120),
});

type RouteContext = {
  params: Promise<{ serverId: string }>;
};

/**
 * 6b's search box searches channel names locally and message content here, so
 * the servers screen can honestly say "Kanallarda ve mesajlarda ara".
 *
 * Deliberately narrower than the channel endpoint: no author/date/exact
 * filters. The workspace search box is a single text field and 00 §2.2 forbids
 * shipping parameters no surface renders.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:server:messages:search");

    const { serverId } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = MobileServerSearchQuerySchema.parse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      q: searchParams.get("q") ?? "",
    });

    const result = await searchServerMessages({
      cursor: query.cursor,
      limit: query.limit,
      query: query.q,
      serverId,
      userId,
    });

    return Response.json(MessageSearchResponseSchema.parse(result), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
