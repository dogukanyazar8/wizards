import { MobileAuthExchangeRequestSchema } from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import { exchangeMobileAuthHandoffToken } from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit } from "../rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    await enforceMobileAuthRateLimit(request, "mobile:auth-exchange");

    const body = await parseJsonBody(request, MobileAuthExchangeRequestSchema);
    const response = await exchangeMobileAuthHandoffToken(body.handoffToken, {
      expectedCallbackPath: body.callbackPath,
    });

    if (!response) {
      throw new ApiError("Mobile sign-in handoff is invalid or expired.", 401, "INVALID_HANDOFF");
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
