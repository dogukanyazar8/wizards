import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { ACCOUNT_DELETION_REAUTH_PURPOSE } from "@/lib/auth/reauth";
import { confirmAccountDeletionReauthEmail } from "@/lib/auth/reauth-email";

const EmailReauthConfirmBodySchema = z.object({
  purpose: z.literal(ACCOUNT_DELETION_REAUTH_PURPOSE),
  token: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "auth:reauth-email-confirm");
    const input = await parseJsonBody(request, EmailReauthConfirmBodySchema);
    const result = await confirmAccountDeletionReauthEmail(userId, input.token);

    return Response.json({
      expiresAt: result.expiresAt.toISOString(),
      reauthToken: result.token,
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
