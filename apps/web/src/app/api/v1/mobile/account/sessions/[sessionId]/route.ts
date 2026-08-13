import { ApiError, jsonError } from "@/lib/api";
import { requireMobileApiSession } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ensureMobileRequestAuthSession } from "@/lib/auth/auth-session-request";
import { deleteAuthSessionRoute } from "@/app/api/v1/users/me/sessions/route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    if (!sessionId || sessionId.length > 128) {
      throw new ApiError("Session not found", 404, "SESSION_NOT_FOUND");
    }
    const context = await requireMobileApiSession(request);
    await enforceApiRateLimit(context.userId, "mobile:account:settings");
    await ensureMobileRequestAuthSession(request, context);
    return Response.json(await deleteAuthSessionRoute(context, sessionId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
