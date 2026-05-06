import { z } from "zod";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { searchChannelMessages } from "@/lib/messages/search-service";

const SearchQuerySchema = z.object({
  author: z.string().trim().max(80).optional(),
  cursor: z.string().optional(),
  exact: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  from: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  q: z.string().trim().min(2).max(120),
  to: z.string().datetime().optional(),
});

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "message:search");
    const { channelId } = await context.params;
    const url = new URL(request.url);
    const query = SearchQuerySchema.parse({
      author: url.searchParams.get("author") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      exact: url.searchParams.get("exact") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      q: url.searchParams.get("q") ?? "",
      to: url.searchParams.get("to") ?? undefined,
    });

    const result = await searchChannelMessages({
      channelId,
      cursor: query.cursor,
      filters: {
        author: query.author,
        exact: query.exact,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
      limit: query.limit,
      query: query.q,
      userId,
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
