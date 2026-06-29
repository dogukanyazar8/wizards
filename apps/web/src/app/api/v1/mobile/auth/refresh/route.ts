import { MobileAuthRefreshRequestSchema } from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { refreshMobileSession } from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit } from "../rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    await enforceMobileAuthRateLimit(request, "mobile:auth-refresh");

    const body = await parseJsonBody(request, MobileAuthRefreshRequestSchema);
    const response = await refreshMobileSession(body.refreshToken);

    if (!response) {
      throw new ApiError("Mobile session refresh is invalid or expired.", 401, "INVALID_REFRESH");
    }

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
