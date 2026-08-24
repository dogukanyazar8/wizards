import { prisma } from "@wizards/db";
import {
  MentionFilterSchema,
  MentionListResponseSchema,
  MentionWindowSchema,
  type MentionListResponse,
} from "@wizards/types";
import { z } from "zod";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";
import { listMentions, type MentionsListQuery } from "@/lib/mentions/mentions-service";
import { parseMentionQuery, parseMentionSource } from "@/lib/mentions/routes";

/**
 * `GET /api/v1/mentions` — Bahsedilmeler akışı (Dalga 1 / Ş3).
 *
 * Filtre, kaynak, arama ve pencere **sunucuda** uygulanır. Sayfalı bir listede istemci
 * süzgeci yalan söyler: "Okunmamış" o zaman "elinde kalan sayfadaki okunmamışlar" demeye
 * başlar ve kullanıcı hiç görmediği kartların olmadığını sanır.
 */

const MentionsQuerySchema = z.object({
  cursor: z.string().min(1).max(400).optional(),
  filter: MentionFilterSchema.default("all"),
  group: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().optional(),
  source: z.string().optional(),
  window: MentionWindowSchema.default("30d"),
});

export type MentionsRouteDependencies = HomeRouteContext & {
  listMentions: (userId: string, query: MentionsListQuery) => Promise<MentionListResponse>;
};

export const defaultMentionsDependencies: MentionsRouteDependencies = {
  // Rota sözleşmesi korumayı rotanın kendi üzerinde görebilsin diye burada adlandırıldı
  // (`route-contract.test.ts`), çalıştırıcıdan devralınmadı.
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listMentions: (userId, query) => listMentions(userId, query, { database: prisma }),
};

export async function mentionsRoute(
  request: Request,
  dependencies: MentionsRouteDependencies = defaultMentionsDependencies,
) {
  return runHomeRoute("mentions:list", dependencies, async (userId) => {
    const params = readSearchParams(request);
    const query = MentionsQuerySchema.parse({
      cursor: optionalParam(params, "cursor"),
      filter: optionalParam(params, "filter"),
      // `group` adres durumunun parçası ama sorguyu değiştirmiyor: gruplama aynı sayfanın
      // çizim kararı. Şema yine de kabul ediyor ki bilinmeyen anahtar diye elenmesin.
      group: optionalParam(params, "group"),
      limit: optionalParam(params, "limit"),
      q: optionalParam(params, "q"),
      source: optionalParam(params, "source"),
      window: optionalParam(params, "window"),
    });

    return MentionListResponseSchema.parse(
      await dependencies.listMentions(userId, {
        cursor: query.cursor,
        filter: query.filter,
        limit: query.limit,
        query: parseMentionQuery(query.q),
        source: parseMentionSource(query.source),
        window: query.window,
      }),
    );
  });
}
