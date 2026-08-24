import { MentionSettingsPatchSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  getMentionSettings,
  updateMentionSettings,
} from "@/lib/notifications/mention-settings-service";

/**
 * Bahsedilmeler Ş4 — SPEC-BAHSEDILMELER §7.
 *
 * Both surfaces that show these switches (the mention modal and the Settings page) come through
 * here, and everything they need to know about how the columns are stored — the two inverted ones
 * included (karar K6) — stays behind `mention-settings-service`.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const userId = await requireApiUserId();

    return Response.json(await getMentionSettings(userId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "settings:update");
    const patch = await parseJsonBody(request, MentionSettingsPatchSchema);

    return Response.json(await updateMentionSettings(userId, patch));
  } catch (error) {
    return jsonError(error);
  }
}
