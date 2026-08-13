import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { ACCOUNT_DELETION_REAUTH_PURPOSE } from "@/lib/auth/reauth";
import { sendAccountDeletionReauthEmail } from "@/lib/auth/reauth-email";

const EmailReauthChallengeBodySchema = z
  .object({
    platform: z.enum(["MOBILE", "WEB"]).default("WEB"),
    purpose: z.literal(ACCOUNT_DELETION_REAUTH_PURPOSE),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "auth:reauth-email-challenge");
    const input = await parseJsonBody(request, EmailReauthChallengeBodySchema);
    const result = await sendAccountDeletionReauthEmail(userId, input.platform);

    return Response.json(
      {
        expiresAt: result.expiresAt.toISOString(),
        success: true,
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
