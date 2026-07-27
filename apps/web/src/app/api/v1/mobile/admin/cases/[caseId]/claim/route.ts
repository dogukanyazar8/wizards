import { headers } from "next/headers";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileAdminCapability } from "@/lib/admin/capabilities";
import { claimModerationCase } from "@/lib/moderation/case-actions";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

/** Bodyless: the claimant is the session, same as on the web console. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireMobileAdminCapability(request, "case.action");
    await enforceApiRateLimit(admin.id, "mobile:admin:case-claim");

    const { caseId } = await context.params;

    return Response.json(
      await claimModerationCase({
        adminUserId: admin.id,
        caseId,
        headers: await headers(),
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
