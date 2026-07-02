import { z } from "zod";
import { MessageSearchResponseSchema } from "@wizards/types";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { searchDMMessages } from "@/lib/messages/search-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MobileSearchQuerySchema = z.object({
  author: z.string().trim().max(80).optional(),
  cursor: z.string().optional(),
  exact: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  from: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(25).optional(),
  q: z.string().trim().min(2).max(120),
  to: z.string().datetime().optional(),
});

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:message:search");

    const { conversationId } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = MobileSearchQuerySchema.parse({
      author: searchParams.get("author") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      exact: searchParams.get("exact") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      q: searchParams.get("q") ?? "",
      to: searchParams.get("to") ?? undefined,
    });

    const result = await searchDMMessages({
      conversationId,
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

    return Response.json(MessageSearchResponseSchema.parse(result), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
