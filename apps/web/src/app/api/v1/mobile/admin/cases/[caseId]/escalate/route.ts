import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileAdminCapability } from "@/lib/admin/capabilities";
import { escalateMobileAdminCase } from "@/lib/moderation/mobile-case-service";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export const MobileCaseEscalateSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireMobileAdminCapability(request, "case.action");
    await enforceApiRateLimit(admin.id, "mobile:admin:case-escalate");

    const input = await parseJsonBody(request, MobileCaseEscalateSchema);
    const { caseId } = await context.params;

    return Response.json(
      await escalateMobileAdminCase({
        adminUserId: admin.id,
        caseId,
        ...(input.note ? { note: input.note } : {}),
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
