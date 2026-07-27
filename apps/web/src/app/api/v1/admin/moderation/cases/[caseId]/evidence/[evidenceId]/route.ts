import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { deleteEvidenceMessage } from "@/lib/moderation/case-actions";

type RouteContext = {
  params: Promise<{
    caseId: string;
    evidenceId: string;
  }>;
};

export const EvidenceActionSchema = z.object({
  action: z.literal("delete_message"),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("case.action");
    await enforceApiRateLimit(admin.id, "admin:moderation:evidence");

    await parseJsonBody(request, EvidenceActionSchema);
    const { caseId, evidenceId } = await context.params;
    const payload = await deleteEvidenceMessage({
      adminUserId: admin.id,
      caseId,
      evidenceId,
      headers: request.headers,
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
