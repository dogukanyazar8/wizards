import { jsonError } from "@/lib/api";
import { requireApiAuthSession } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { revokeOtherAuthSessionsRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  try {
    const context = await requireApiAuthSession();
    await enforceApiRateLimit(context.userId, "settings:update");
    return Response.json(await revokeOtherAuthSessionsRoute(context), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
