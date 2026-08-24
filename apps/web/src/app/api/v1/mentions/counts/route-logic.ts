import { prisma } from "@wizards/db";
import { MentionCountsSchema, MentionWindowSchema, type MentionCounts } from "@wizards/types";
import { z } from "zod";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";
import { countMentions } from "@/lib/mentions/mentions-service";

/**
 * `GET /api/v1/mentions/counts` — ray satırları, sekmeler ve başlık pili.
 *
 * Karar K4: bu uç ile `app/summary`nin `unreadMentions` alanı **aynı yardımcıyı** çağırır.
 * İki ayrı toplama, `Okunmadı işaretle` eklendiği gün kaçınılmaz olarak ayrışırdı.
 *
 * Tek fark pencere: gezinme paneli rozeti `window=all` sayar (30 günden eski bir okunmamış
 * bahsetme hâlâ okunmamıştır), bu uç ekranın gösterdiği pencereyi sayar. Ekranın
 * `Hepsi okundu` durumu bu yüzden sayaca değil kendi penceresine bakar.
 */

const CountsQuerySchema = z.object({ window: MentionWindowSchema.default("30d") });

export type MentionCountsRouteDependencies = HomeRouteContext & {
  countMentions: (userId: string, window: "30d" | "all") => Promise<MentionCounts>;
};

export const defaultMentionCountsDependencies: MentionCountsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  countMentions: (userId, window) => countMentions(userId, { window }, { database: prisma }),
  enforceRateLimit: enforceApiRateLimit,
};

export async function mentionCountsRoute(
  request: Request,
  dependencies: MentionCountsRouteDependencies = defaultMentionCountsDependencies,
) {
  return runHomeRoute("mentions:counts", dependencies, async (userId) => {
    const query = CountsQuerySchema.parse({
      window: optionalParam(readSearchParams(request), "window"),
    });

    return MentionCountsSchema.parse(await dependencies.countMentions(userId, query.window));
  });
}
