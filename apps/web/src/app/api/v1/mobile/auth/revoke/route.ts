import { MobileAuthRevokeRequestSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import {
  getBearerTokenFromRequest,
  revokeMobileSession,
  verifyMobileAccessToken,
} from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit } from "../rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    await enforceMobileAuthRateLimit(request, "mobile:auth-revoke");

    const body = await parseJsonBody(request, MobileAuthRevokeRequestSchema);
    const accessToken = getBearerTokenFromRequest(request);
    let sessionId: string | null = null;

    if (accessToken) {
      try {
        sessionId = verifyMobileAccessToken(accessToken)?.sessionId ?? null;
      } catch {
        sessionId = null;
      }
    }

    await revokeMobileSession({
      refreshToken: body.refreshToken ?? null,
      sessionId,
    });

    return new Response(null, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
      status: 204,
    });
  } catch (error) {
    return jsonError(error);
  }
}
