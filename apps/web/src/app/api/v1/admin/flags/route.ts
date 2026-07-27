import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { listAdminFeatureFlags } from "@/lib/feature-flags/admin-service";

export async function GET() {
  try {
    const admin = await requireAdminCapability("flag.write");
    await enforceApiRateLimit(admin.id, "admin:flag:list");

    const flags = await listAdminFeatureFlags();

    return Response.json({ flags });
  } catch (error) {
    return jsonError(error);
  }
}
