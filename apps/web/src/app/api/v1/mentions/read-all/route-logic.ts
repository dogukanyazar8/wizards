import { prisma } from "@wizards/db";
import type { MentionCounts } from "@wizards/types";
import { z } from "zod";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { readSearchParams, type HomeRouteContext } from "@/lib/home/route-runner";
import {
  countMentions,
  markAllMentionsRead,
  undoMarkAllMentionsRead,
  type MentionReadAllResult,
  type MentionUndoResult,
} from "@/lib/mentions/mentions-service";
import {
  defaultMentionRealtimePublisher,
  type MentionRealtimePublisher,
} from "@/lib/mentions/realtime";

/**
 * `POST /api/v1/mentions/read-all` ve `POST ...?undo=1`.
 *
 * Karar K11: bu uç **yalnız bahsetmeleri** okur. Bugünkü `markAllNotificationsRead`
 * kullanıcının arkadaşlık isteklerini ve sistem bildirimlerini de sessizce okuyor; bu ekran
 * onu çağırmaz. Yazılan bildirim kimlikleri bahsetme sorgusundan geliyor, yani kapsam
 * dışında bir satıra dokunması mümkün değil.
 *
 * Geri alma penceresi 10 dakika ve tek kullanımlık: kayıt Redis'te kısa ömürlü duruyor,
 * geri alındığında siliniyor. İki kez geri alınabilen bir eylem, ikinci çağrıda kullanıcının
 * o arada okuduğu kartları da geri açardı.
 */

const ReadAllBodySchema = z.object({ undoToken: z.string().min(1).max(200).optional() }).strict();

export type MentionReadAllRouteDependencies = HomeRouteContext & {
  countMentions: (userId: string) => Promise<MentionCounts>;
  markAllRead: (userId: string) => Promise<MentionReadAllResult>;
  publisher: MentionRealtimePublisher;
  undoReadAll: (userId: string, token: string) => Promise<MentionUndoResult>;
};

export const defaultMentionReadAllDependencies: MentionReadAllRouteDependencies = {
  authenticate: () => requireApiUserId(),
  countMentions: (userId) => countMentions(userId, { window: "all" }, { database: prisma }),
  enforceRateLimit: enforceApiRateLimit,
  markAllRead: (userId) => markAllMentionsRead(userId, { database: prisma }),
  publisher: defaultMentionRealtimePublisher,
  undoReadAll: (userId, token) => undoMarkAllMentionsRead(userId, token, { database: prisma }),
};

/** Sıra: kimlik, bütçe, gövde. Gerekçe kardeş uçtaki notta. */
export async function mentionReadAllRoute(
  request: Request,
  dependencies: MentionReadAllRouteDependencies = defaultMentionReadAllDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "mentions:read-all");
    const isUndo = readSearchParams(request).get("undo") === "1";
    const body = await parseJsonBody(request, ReadAllBodySchema);
    const headers = { "Cache-Control": "private, no-store" };

    if (isUndo) {
      const undone = await dependencies.undoReadAll(userId, body.undoToken ?? "");
      dependencies.publisher.publishMentionReadAll(
        userId,
        await dependencies.countMentions(userId),
      );

      return Response.json({ restored: undone.restored }, { headers });
    }

    const result = await dependencies.markAllRead(userId);
    dependencies.publisher.publishMentionReadAll(userId, await dependencies.countMentions(userId));

    return Response.json({ affected: result.affected, undoToken: result.undoToken }, { headers });
  } catch (error) {
    return jsonError(error);
  }
}
