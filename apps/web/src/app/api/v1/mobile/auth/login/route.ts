import { MobileAuthPasswordLoginRequestSchema } from "@wizards/types";

import { ApiError, jsonError, parseJsonBody } from "@/lib/api";
import {
  createMobilePasswordSession,
  MobileNativeAuthError,
} from "@/lib/mobile/auth";
import { enforceMobileAuthRateLimit } from "../rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    await enforceMobileAuthRateLimit(request, "mobile:auth-login");

    const body = await parseJsonBody(request, MobileAuthPasswordLoginRequestSchema);
    const response = await createMobilePasswordSession(body);

    if (!response) {
      throw new ApiError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    return Response.json(response, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof MobileNativeAuthError) {
      return jsonError(new ApiError(error.message, error.status, error.code));
    }

    return jsonError(error);
  }
}
