import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileAdminCapability } from "@/lib/admin/capabilities";
import { getMobileAdminCase } from "@/lib/moderation/mobile-case-service";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const admin = await requireMobileAdminCapability(request, "case.read");
    await enforceApiRateLimit(admin.id, "mobile:admin:case-detail");

    const { caseId } = await context.params;

    return Response.json({ case: await getMobileAdminCase(caseId) });
  } catch (error) {
    return jsonError(error);
  }
}
