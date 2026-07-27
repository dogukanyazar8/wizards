import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  listClusterSuggestions,
  recomputeClusterSuggestions,
} from "@/lib/feedback/cluster-service";

export async function GET() {
  try {
    const admin = await requireAdminCapability("feedback.read");
    await enforceApiRateLimit(admin.id, "admin:feedback:clusters");

    const suggestions = await listClusterSuggestions();

    return Response.json({ suggestions });
  } catch (error) {
    return jsonError(error);
  }
}

/** Bodyless: recomputing reads the feedback table, it takes no input. */
export async function POST() {
  try {
    const admin = await requireAdminCapability("feedback.write");
    await enforceApiRateLimit(admin.id, "admin:feedback:cluster-recompute");

    const result = await recomputeClusterSuggestions();

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
