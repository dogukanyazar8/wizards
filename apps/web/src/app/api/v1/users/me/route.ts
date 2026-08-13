import { AccountDeletionRequestSchema } from "@wizards/types";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import {
  ACCOUNT_DELETION_REAUTH_HEADER,
  requireAccountDeletionReauthToken,
} from "@/lib/auth/reauth";
import { anonymizeAccount } from "@/lib/account/privacy-service";

export async function DELETE(request: Request) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "user:delete");
    await parseJsonBody(request, AccountDeletionRequestSchema);
    await requireAccountDeletionReauthToken(
      userId,
      request.headers.get(ACCOUNT_DELETION_REAUTH_HEADER),
    );

    const result = await anonymizeAccount(userId);

    return Response.json({
      deletedAt: result.deletedAt.toISOString(),
      success: true,
    });
  } catch (error) {
    return jsonError(error);
  }
}
