import { prisma } from "@wizards/db";
import {
  BADGE_CATALOG,
  BADGE_IDS,
  OwnBadgesResponseSchema,
  UserBadgesResponseSchema,
  nextBadgeThreshold,
  sortBadges,
  type BadgeId,
  type BadgeProgress,
  type OwnBadgesResponse,
  type UserBadgesResponse,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  readOwnBadgeProgress as readOwnBadgeProgressService,
  readUserBadges as readUserBadgesService,
} from "@/lib/badges/badge-service";

/**
 * One body producer for four routes: mobile and web, peer and self.
 *
 * The duplication these functions exist to prevent is not code duplication but
 * payload drift — if each platform assembled its own badge response, the same
 * account could show a different set of badges on a phone and in the browser.
 * The routes carry authentication and a rate-limit action and nothing else, so
 * a divergence would have to be written here, in one place, for both at once.
 */

export type BadgeRouteDependencies = {
  readUserBadges: typeof readUserBadgesService;
  readOwnBadgeProgress: typeof readOwnBadgeProgressService;
  readUserGate: (userId: string) => Promise<{ isBanned: boolean; deletedAt: Date | null } | null>;
};

export const defaultBadgeRouteDependencies: BadgeRouteDependencies = {
  readOwnBadgeProgress: readOwnBadgeProgressService,
  readUserBadges: readUserBadgesService,
  readUserGate: (userId) =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, isBanned: true },
    }),
};

/**
 * The ladder "Rozetlerim" draws. Every AWARDED badge appears whether or not the
 * counter behind it has ever been written, so the screen shows the same rows on
 * day one as it does after a year (03 §5).
 */
const AWARDED_BADGE_IDS: readonly BadgeId[] = BADGE_IDS.filter(
  (id) => BADGE_CATALOG[id].layer === "awarded",
);

export type HandleReadUserBadgesArgs = {
  /**
   * The session behind the request. Badges are a public part of the profile
   * card today, so the answer does not depend on who is asking; the id is
   * carried because a viewer-dependent rule would have to be applied here.
   */
  requesterId: string;
  userId: string;
  dependencies?: BadgeRouteDependencies;
};

export async function handleReadUserBadges(
  args: HandleReadUserBadgesArgs,
): Promise<UserBadgesResponse> {
  const dependencies = args.dependencies ?? defaultBadgeRouteDependencies;
  const gate = await dependencies.readUserGate(args.userId);

  if (gate === null) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  // A suspended or deleted account answers with an empty list rather than a
  // 404: the card that asked is already drawing its restricted view, and a 404
  // would read as "no such person" (00 §4 cancellation matrix). The rows stay
  // in the table either way — moderation needs the history.
  if (gate.isBanned || gate.deletedAt !== null) {
    return UserBadgesResponseSchema.parse({ badges: [] });
  }

  return UserBadgesResponseSchema.parse({
    badges: await dependencies.readUserBadges({ userId: args.userId }),
  });
}

export type HandleReadOwnBadgesArgs = {
  userId: string;
  dependencies?: BadgeRouteDependencies;
};

export async function handleReadOwnBadges(
  args: HandleReadOwnBadgesArgs,
): Promise<OwnBadgesResponse> {
  const dependencies = args.dependencies ?? defaultBadgeRouteDependencies;
  const [badges, storedProgress] = await Promise.all([
    dependencies.readUserBadges({ userId: args.userId }),
    dependencies.readOwnBadgeProgress({ userId: args.userId }),
  ]);

  const counted = new Set(storedProgress.map((entry) => entry.id));
  const missing: BadgeProgress[] = AWARDED_BADGE_IDS.filter((id) => !counted.has(id)).map((id) => ({
    id,
    nextThreshold: nextBadgeThreshold(id, 0)?.threshold ?? null,
    tier: 0,
    value: 0,
  }));

  return OwnBadgesResponseSchema.parse({
    badges,
    // One ordering rule for the whole product; the progress list is sorted the
    // same way the earned list is, so the two columns line up on screen.
    progress: sortBadges([...storedProgress, ...missing]),
  });
}
