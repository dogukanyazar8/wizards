import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { getModerationCaseFile } from "@/lib/moderation/case-queries";

export async function GET(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const admin = await requireAdminCapability("case.read");
    await enforceApiRateLimit(admin.id, "admin:moderation:detail");

    const { caseId } = await context.params;
    const caseFile = await getModerationCaseFile(caseId);

    if (!caseFile) {
      throw new ApiError("Case not found.", 404, "NOT_FOUND");
    }

    return Response.json({ case: caseFile });
  } catch (error) {
    return jsonError(error);
  }
}
