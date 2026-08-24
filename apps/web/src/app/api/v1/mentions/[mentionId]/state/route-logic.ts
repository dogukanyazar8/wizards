import { prisma } from "@wizards/db";
import {
  MentionSchema,
  type Mention,
  type MentionCounts,
  type MentionStateKey,
} from "@wizards/types";
import { z } from "zod";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import type { HomeRouteContext } from "@/lib/home/route-runner";
import {
  countMentions,
  updateMentionState,
  type MentionStatePatch,
} from "@/lib/mentions/mentions-service";
import {
  defaultMentionRealtimePublisher,
  type MentionRealtimePublisher,
} from "@/lib/mentions/realtime";
import { readMentionKey } from "@/app/api/v1/mentions/[mentionId]/context/route-logic";

/**
 * `PATCH /api/v1/mentions/[mentionId]/state` — okundu / sonra oku / listeden kaldır.
 *
 * Üç alan da isteğe bağlı ve **bağımsız**: `readLater` yazmak okundu bayrağına dokunmaz
 * (karar K5, kart okunmamış kalır ve üstte sabitlenir), `dismissed` yazmak mesajı silmez.
 *
 * Yanıt güncel kartın kendisi. İstemcinin yazdıktan sonra listeyi yeniden çekmesi, sayfalı
 * bir akışta kaydırma konumunu kaybetmek demekti.
 */

const MentionStatePatchSchema = z
  .object({
    dismissed: z.boolean().optional(),
    read: z.boolean().optional(),
    readLater: z.boolean().optional(),
  })
  .strict()
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    // Boş bir yama yazma değil, gürültüdür: yazacak bir şeyi olmayan istek satırı yine de
    // oluşturur ve `MentionState` tembel doğsun diye tasarlandı.
    { message: "At least one of read, readLater or dismissed is required" },
  );

export type MentionStateRouteDependencies = HomeRouteContext & {
  countMentions: (userId: string) => Promise<MentionCounts>;
  publisher: MentionRealtimePublisher;
  updateMentionState: (
    userId: string,
    key: MentionStateKey,
    patch: MentionStatePatch,
  ) => Promise<Mention>;
};

export const defaultMentionStateDependencies: MentionStateRouteDependencies = {
  authenticate: () => requireApiUserId(),
  countMentions: (userId) => countMentions(userId, { window: "all" }, { database: prisma }),
  enforceRateLimit: enforceApiRateLimit,
  publisher: defaultMentionRealtimePublisher,
  updateMentionState: (userId, key, patch) =>
    updateMentionState(userId, key, patch, { database: prisma }),
};

/**
 * `runHomeRoute` yerine açık `try`/`catch`: gövde ayrıştırması rotanın **kendi** gövdesinde
 * durmalı. Rota sözleşmesi (`route-contract.test.ts`) `parseJsonBody`nin dışa açılan
 * işleyicinin `request`ini tükettiğini AST üzerinden izliyor ve bir geri çağrının içine
 * gömülmüş çağrıyı göremez — göremediği şey de "gövdesiz uç" listesine düşer.
 *
 * Sıra yine aynı: kimlik, bütçe, sonra gövde. Kimliği doğrulanmamış bir isteğin gövdesini
 * okumak, hiç kimsenin adına iş yapmak demek.
 */
export async function mentionStateRoute(
  request: Request,
  mentionId: string,
  dependencies: MentionStateRouteDependencies = defaultMentionStateDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "mentions:state");
    const key = readMentionKey(mentionId);
    const patch = await parseJsonBody(request, MentionStatePatchSchema);
    const mention = await dependencies.updateMentionState(userId, key, patch);
    const counts = await dependencies.countMentions(userId);

    // Aynı hesabın diğer sekmeleri ve masaüstü uygulaması da bu kartı gösteriyor olabilir.
    dependencies.publisher.publishMentionState(
      userId,
      {
        dismissed: patch.dismissed ?? false,
        mentionId: mention.id,
        readLater: mention.readLater,
        unread: mention.unread,
      },
      counts,
    );

    return Response.json(MentionSchema.parse(mention), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
