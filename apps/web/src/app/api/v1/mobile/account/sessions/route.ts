import { jsonError } from "@/lib/api";
import { requireMobileApiSession } from "@/lib/auth/api";
import { ensureMobileRequestAuthSession } from "@/lib/auth/auth-session-request";
import { getAuthSessionsRoute } from "@/app/api/v1/users/me/sessions/route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const context = await requireMobileApiSession(request);
    await ensureMobileRequestAuthSession(request, context);
    return Response.json(await getAuthSessionsRoute(context), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
