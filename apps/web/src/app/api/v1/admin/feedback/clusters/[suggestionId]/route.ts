import { z } from "zod";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { acceptClusterSuggestion, rejectClusterSuggestion } from "@/lib/feedback/cluster-service";

type RouteContext = {
  params: Promise<{
    suggestionId: string;
  }>;
};

export const ClusterSuggestionDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("accept"), roadmapItemId: z.string().trim().min(1) }),
  z.object({ decision: z.literal("reject") }),
]);

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("feedback.write");
    await enforceApiRateLimit(admin.id, "admin:feedback:cluster-decision");

    const input = await parseJsonBody(request, ClusterSuggestionDecisionSchema);
    const { suggestionId } = await context.params;

    if (input.decision === "reject") {
      return Response.json(
        await rejectClusterSuggestion({
          adminUserId: admin.id,
          headers: request.headers,
          suggestionId,
        }),
      );
    }

    return Response.json(
      await acceptClusterSuggestion({
        adminUserId: admin.id,
        headers: request.headers,
        roadmapItemId: input.roadmapItemId,
        suggestionId,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
