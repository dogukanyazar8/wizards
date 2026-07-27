import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { applyModerationCaseAction } from "@/lib/moderation/case-actions";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export const ModerationCaseActionSchema = z.object({
  action: z.enum(["ban", "dismiss", "warn"]),
  resolution: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("case.action");
    await enforceApiRateLimit(admin.id, "admin:moderation:action");

    const input = await parseJsonBody(request, ModerationCaseActionSchema);
    const { caseId } = await context.params;
    const payload = await applyModerationCaseAction({
      action: input.action,
      adminUserId: admin.id,
      caseId,
      headers: request.headers,
      resolution: input.resolution,
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
