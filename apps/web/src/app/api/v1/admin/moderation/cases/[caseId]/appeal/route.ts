import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { resolveModerationAppeal } from "@/lib/moderation/appeal-service";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export const AppealDecisionSchema = z.object({
  note: z.string().trim().min(1).max(1000),
  resolution: z.enum(["granted", "rejected"]),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("case.action");
    await enforceApiRateLimit(admin.id, "admin:moderation:appeal");

    const input = await parseJsonBody(request, AppealDecisionSchema);
    const { caseId } = await context.params;
    const payload = await resolveModerationAppeal({
      adminUserId: admin.id,
      caseId,
      note: input.note,
      resolution: input.resolution,
    });

    await writeAdminAuditLog({
      action: "moderation.appeal.resolve",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { resolution: input.resolution },
      reason: input.note,
      targetId: caseId,
      targetType: "ModerationCase",
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
