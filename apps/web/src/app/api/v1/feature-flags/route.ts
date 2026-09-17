import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { evaluateFlagsForUser } from "@/lib/feature-flags/service";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId();
    const flags = await evaluateFlagsForUser({
      userId,
      clientType: getAnalyticsClientInfo(request.headers).clientType,
    });
    return Response.json(flags, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
