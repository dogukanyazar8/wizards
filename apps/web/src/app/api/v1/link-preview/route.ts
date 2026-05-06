import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { ApiError, jsonError } from "@/lib/api";
import { fetchLinkPreview } from "@/lib/messages/link-preview";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "link-preview");

    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      throw new ApiError("URL is required", 400, "INVALID_URL");
    }

    return Response.json(await fetchLinkPreview(url));
  } catch (error) {
    return jsonError(error);
  }
}
