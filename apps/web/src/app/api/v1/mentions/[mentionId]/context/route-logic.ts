import { prisma } from "@wizards/db";
import {
  MentionContextSchema,
  parseMentionId,
  type MentionContext,
  type MentionStateKey,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { runHomeRoute, type HomeRouteContext } from "@/lib/home/route-runner";
import { getMentionContext } from "@/lib/mentions/mentions-service";

/**
 * `GET /api/v1/mentions/[mentionId]/context` — SPEC §6 bağlam paneli, bahsetmenin ±2 mesajı.
 *
 * `mentionId` bileşiktir (`"<source>:<refId>"`). Çözümleme `packages/types` şemasıyla
 * yapılır, elle `split` yazılmaz: tanınmayan bir kaynağa düşen ayrıştırıcı, ait olmadığı
 * satırı okuyan bir sorgu demektir.
 */

export function readMentionKey(rawId: string): MentionStateKey {
  // Adres çubuğundan gelen değer kodlanmış olabilir; `%3A` da bir iki nokta üst üstedir.
  const key = parseMentionId(decodeURIComponent(rawId));
  if (!key) {
    throw new ApiError("Invalid mention id", 400, "MENTION_ID_INVALID");
  }

  return key;
}

export type MentionContextRouteDependencies = HomeRouteContext & {
  getMentionContext: (userId: string, key: MentionStateKey) => Promise<MentionContext>;
};

export const defaultMentionContextDependencies: MentionContextRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  getMentionContext: (userId, key) => getMentionContext(userId, key, { database: prisma }),
};

export async function mentionContextRoute(
  _request: Request,
  mentionId: string,
  dependencies: MentionContextRouteDependencies = defaultMentionContextDependencies,
) {
  return runHomeRoute("mentions:context", dependencies, async (userId) =>
    MentionContextSchema.parse(
      await dependencies.getMentionContext(userId, readMentionKey(mentionId)),
    ),
  );
}
