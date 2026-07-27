import { headers } from "next/headers";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { claimModerationCase } from "@/lib/moderation/case-actions";

/** Bodyless on purpose: the claimant is the session. */
export async function POST(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const admin = await requireAdminCapability("case.action");
    await enforceApiRateLimit(admin.id, "admin:moderation:claim");

    const { caseId } = await context.params;
    const payload = await claimModerationCase({
      adminUserId: admin.id,
      caseId,
      headers: await headers(),
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
