import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import {
  ACCOUNT_DELETION_REAUTH_PURPOSE,
  createAccountDeletionReauthTokenForPassword,
} from "@/lib/auth/reauth";

const ReauthBodySchema = z.object({
  password: z.string().min(1),
  purpose: z.literal(ACCOUNT_DELETION_REAUTH_PURPOSE),
});

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "auth:reauth");
    const input = await parseJsonBody(request, ReauthBodySchema);
    const result = await createAccountDeletionReauthTokenForPassword(userId, input.password);

    return Response.json({
      expiresAt: result.expiresAt.toISOString(),
      reauthToken: result.token,
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
