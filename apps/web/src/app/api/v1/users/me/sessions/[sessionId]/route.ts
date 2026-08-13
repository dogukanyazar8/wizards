import { ApiError, jsonError } from "@/lib/api";
import { requireApiAuthSession } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { deleteAuthSessionRoute } from "../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    if (!sessionId || sessionId.length > 128) {
      throw new ApiError("Session not found", 404, "SESSION_NOT_FOUND");
    }
    const context = await requireApiAuthSession();
    await enforceApiRateLimit(context.userId, "settings:update");
    return Response.json(await deleteAuthSessionRoute(context, sessionId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
