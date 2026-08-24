import { prisma } from "@wizards/db";
import { FriendsSortRequestSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Mesajlar karar #8. The ordering the Arkadaşlar list opens with.
 *
 * Persisted rather than kept in the URL because it is a reading habit, not a
 * per-visit filter: somebody who reads by name wants it that way tomorrow too.
 */
const TO_COLUMN = { name: "NAME", recent: "RECENT", status: "STATUS" } as const;
const FROM_COLUMN = { NAME: "name", RECENT: "recent", STATUS: "status" } as const;

/**
 * Okuma da burada, ortak `/users/me/settings` yükünde değil.
 *
 * Tercih yalnız bu ekranın işine yarıyor; her açılışta okunan kabuk ayarlarına
 * eklemek, Ana Sayfa'nın da taşıdığı bir alan demek olurdu.
 */
export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "friend:sort");

    const settings = await prisma.userSettings.findUnique({
      select: { friendsSort: true },
      where: { userId },
    });

    return Response.json({ sort: FROM_COLUMN[settings?.friendsSort ?? "STATUS"] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "friend:sort");
    const { sort } = await parseJsonBody(request, FriendsSortRequestSchema);

    await prisma.userSettings.upsert({
      create: { friendsSort: TO_COLUMN[sort], userId },
      update: { friendsSort: TO_COLUMN[sort] },
      where: { userId },
    });

    return Response.json({ sort });
  } catch (error) {
    return jsonError(error);
  }
}
