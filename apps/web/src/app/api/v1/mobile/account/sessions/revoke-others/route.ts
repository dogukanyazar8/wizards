import { jsonError } from "@/lib/api";
import { requireMobileApiSession } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ensureMobileRequestAuthSession } from "@/lib/auth/auth-session-request";
import { revokeOtherAuthSessionsRoute } from "@/app/api/v1/users/me/sessions/route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const context = await requireMobileApiSession(request);
    await enforceApiRateLimit(context.userId, "mobile:account:settings");
    await ensureMobileRequestAuthSession(request, context);
    return Response.json(await revokeOtherAuthSessionsRoute(context), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
