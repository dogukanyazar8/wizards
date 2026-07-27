import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireBannedApiUserId } from "@/lib/auth/api";
import { APPEAL_MAX_LENGTH, openModerationAppeal } from "@/lib/moderation/appeal-service";

export const ModerationAppealSchema = z.object({
  body: z.string().trim().min(1).max(APPEAL_MAX_LENGTH),
});

/**
 * Reachable by a banned session: the ban blocks the product, not the one door
 * that lets someone say the decision was wrong.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireBannedApiUserId();
    await enforceApiRateLimit(userId, "moderation:appeal");

    const input = await parseJsonBody(request, ModerationAppealSchema);
    const payload = await openModerationAppeal({ body: input.body, userId });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
