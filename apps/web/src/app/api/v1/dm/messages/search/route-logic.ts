import { z } from "zod";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { searchAllDMMessages } from "@/lib/messages/global-dm-search-service";

/**
 * Mesajlar karar #6 — görüntüleyenin tüm DM ve gruplarında arama.
 *
 * Üyelik ve geçmiş penceresi servisin sorgusunda; bu katman yalnız sorgu
 * dizesini okur ve hız sınırını uygular.
 */
export type GlobalDMSearchRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  search: typeof searchAllDMMessages;
};

const defaults: GlobalDMSearchRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  search: searchAllDMMessages,
};

const QuerySchema = z.object({
  cursor: z.string().max(512).nullish(),
  from: z.string().datetime().nullish(),
  limit: z.coerce.number().int().positive().max(50).nullish(),
  personId: z.string().max(128).nullish(),
  q: z.string().max(200),
  to: z.string().datetime().nullish(),
});

export async function globalDMSearchRoute(
  request: Request,
  dependencies: GlobalDMSearchRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:messages:search");

    const url = new URL(request.url);
    const parsed = QuerySchema.parse({
      cursor: url.searchParams.get("cursor"),
      from: url.searchParams.get("from"),
      limit: url.searchParams.get("limit") ?? undefined,
      personId: url.searchParams.get("personId"),
      q: url.searchParams.get("q") ?? "",
      to: url.searchParams.get("to"),
    });

    const page = await dependencies.search({
      cursor: parsed.cursor ?? null,
      from: parsed.from ? new Date(parsed.from) : null,
      limit: parsed.limit ?? null,
      personId: parsed.personId ?? null,
      query: parsed.q,
      to: parsed.to ? new Date(parsed.to) : null,
      userId,
    });

    return Response.json(page);
  } catch (error) {
    return jsonError(error);
  }
}
