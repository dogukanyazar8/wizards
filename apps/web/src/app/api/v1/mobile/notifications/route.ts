import {
  MobilePushRegistrationRequestSchema,
  MobilePushRegistrationRevokeResponseSchema,
  MobilePushRegistrationResponseSchema,
} from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiSession } from "@/lib/auth/api";
import {
  registerMobilePushToken,
  revokeMobilePushToken,
} from "@/lib/mobile/push-notifications";
import { mobileNotificationsListRoute } from "./route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  return mobileNotificationsListRoute(request);
}

export async function POST(request: Request) {
  try {
    const session = await requireMobileApiSession(request);
    await enforceApiRateLimit(session.userId, "mobile:notifications:register");

    const body = await parseJsonBody(request, MobilePushRegistrationRequestSchema);
    const response = await registerMobilePushToken({
      platform: body.platform,
      provider: body.provider,
      sessionId: session.sessionId,
      token: body.token,
      userId: session.userId,
    });

    return Response.json(MobilePushRegistrationResponseSchema.parse(response), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireMobileApiSession(request);
    await enforceApiRateLimit(session.userId, "mobile:notifications:revoke");

    const response = await revokeMobilePushToken({
      sessionId: session.sessionId,
    });

    return Response.json(MobilePushRegistrationRevokeResponseSchema.parse(response), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
