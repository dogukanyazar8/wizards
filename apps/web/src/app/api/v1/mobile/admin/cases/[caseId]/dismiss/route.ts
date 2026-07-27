import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileAdminCapability } from "@/lib/admin/capabilities";
import { applyModerationCaseAction } from "@/lib/moderation/case-actions";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export const MobileCaseDismissSchema = z.object({
  resolution: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireMobileAdminCapability(request, "case.action");
    await enforceApiRateLimit(admin.id, "mobile:admin:case-dismiss");

    const input = await parseJsonBody(request, MobileCaseDismissSchema);
    const { caseId } = await context.params;

    return Response.json(
      await applyModerationCaseAction({
        action: "dismiss",
        adminUserId: admin.id,
        caseId,
        headers: request.headers,
        resolution: input.resolution,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
