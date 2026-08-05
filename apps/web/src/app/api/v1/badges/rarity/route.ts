import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { readBadgeRarity } from "@/lib/badges/badge-rarity";

/**
 * The rarity summary, apart from the badge responses because those schemas are
 * frozen and because this number moves once a day rather than per event (08 §4).
 * The handler runs no query: the sweep already computed the answer.
 */
export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "user:badges:rarity");

    return Response.json(await readBadgeRarity());
  } catch (error) {
    return jsonError(error);
  }
}
