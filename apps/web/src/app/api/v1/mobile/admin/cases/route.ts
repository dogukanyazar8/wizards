import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileAdminCapability } from "@/lib/admin/capabilities";
import { listMobileAdminCases } from "@/lib/moderation/mobile-case-service";

export async function GET(request: Request) {
  try {
    const admin = await requireMobileAdminCapability(request, "case.read");
    await enforceApiRateLimit(admin.id, "mobile:admin:cases");

    return Response.json({ cases: await listMobileAdminCases() });
  } catch (error) {
    return jsonError(error);
  }
}
