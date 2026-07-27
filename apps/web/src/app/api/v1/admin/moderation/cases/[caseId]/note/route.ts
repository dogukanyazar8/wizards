import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { addModerationCaseNote } from "@/lib/moderation/case-actions";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export const ModerationCaseNoteSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("case.action");
    await enforceApiRateLimit(admin.id, "admin:moderation:note");

    const input = await parseJsonBody(request, ModerationCaseNoteSchema);
    const { caseId } = await context.params;
    const payload = await addModerationCaseNote({
      adminUserId: admin.id,
      body: input.body,
      caseId,
      headers: request.headers,
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
