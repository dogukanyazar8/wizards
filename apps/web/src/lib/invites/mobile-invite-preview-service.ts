import type { Prisma, PrismaClient } from "@wizards/db";
import type { MobileInvitePreviewResponse } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { getServerPublicProfileWithDatabase } from "@/lib/servers/server-public-profile-service";

const MOBILE_INVITE_PREVIEW_SELECT = {
  expiresAt: true,
  maxUses: true,
  server: { select: { id: true } },
  targetUserId: true,
  uses: true,
} satisfies Prisma.ServerInviteSelect;

function inviteCanBePreviewed(
  invite: {
    readonly expiresAt: Date | null;
    readonly maxUses: number | null;
    readonly targetUserId: string | null;
    readonly uses: number;
  },
  userId: string,
): boolean {
  if (invite.targetUserId !== null && invite.targetUserId !== userId) {
    return false;
  }

  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= Date.now()) {
    return false;
  }

  return invite.maxUses === null || invite.uses < invite.maxUses;
}

export async function getMobileInvitePreview(
  userId: string,
  slug: string,
): Promise<MobileInvitePreviewResponse> {
  const { prisma } = await import("@wizards/db");
  return getMobileInvitePreviewWithDatabase(prisma, userId, slug);
}

async function getMobileInvitePreviewWithDatabase(
  database: PrismaClient,
  userId: string,
  slug: string,
): Promise<MobileInvitePreviewResponse> {
  const directInvite = await database.serverInvite.findUnique({
    select: MOBILE_INVITE_PREVIEW_SELECT,
    where: { code: slug },
  });
  // A direct, globally unique invite code always wins. Only then can a stable
  // community vanity slug resolve to the newest public link invite.
  const invite =
    directInvite ??
    (await database.serverInvite.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: MOBILE_INVITE_PREVIEW_SELECT,
      where: {
        server: { vanityUrlCode: slug },
        targetUserId: null,
      },
    }));

  if (!invite || !inviteCanBePreviewed(invite, userId)) {
    throw new ApiError("Invite not found", 404, "INVITE_NOT_FOUND");
  }

  const profile = await getServerPublicProfileWithDatabase(database, invite.server.id, userId);

  // Faz 1 §B6.5: the preview is the profile read model plus the slug that
  // resolved it. Projecting a subset here is what would force Faz 5 to write a
  // second screen body for the CommunityInvite route.
  return { ...profile, slug };
}
